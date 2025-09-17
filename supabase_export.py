import os
import time
import pandas as pd
from supabase import create_client, Client
import requests
from tqdm import tqdm
import shutil
import argparse

# Опционально загружаем .env, если установлен python-dotenv; если нет — простая ручная загрузка .env
def _load_env():
    """Загрузка переменных окружения из .env.
    Сначала пытаемся через python-dotenv, если недоступно — читаем .env вручную.
    """
    loaded = False
    try:
        from dotenv import load_dotenv  # type: ignore
        load_dotenv()
        loaded = True
    except Exception:
        pass

    # Ручная подгрузка .env, если переменные ещё не заданы
    if not loaded:
        # Ищем .env в текущей директории и в директории скрипта
        candidates = [
            os.path.join(os.getcwd(), ".env"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"),
        ]
        for env_path in candidates:
            if os.path.exists(env_path):
                try:
                    with open(env_path, "r", encoding="utf-8") as fh:
                        for line in fh:
                            line = line.strip()
                            if not line or line.startswith("#"):
                                continue
                            if "=" in line:
                                key, val = line.split("=", 1)
                                key = key.strip()
                                val = val.strip().strip('"').strip("'")
                                if key and key not in os.environ:
                                    os.environ[key] = val
                except Exception:
                    # Тихо пропускаем, если .env нечитаем
                    pass

_load_env()

def _get_first_env(*names: str) -> str | None:
    for n in names:
        v = os.getenv(n)
        if v:
            return v
    return None

# Берём ключи из окружения (чтобы не хранить в коде)
SUPABASE_URL = _get_first_env(
    "SUPABASE_URL",
    "REACT_APP_SUPABASE_URL",
    "VITE_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
)
SUPABASE_KEY = _get_first_env(
    "SUPABASE_KEY",
    "REACT_APP_SUPABASE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
)

DATASET_DIR = r"C:\Users\MB06\Desktop\IT\table\dataset"
PICTURES_DIR = os.path.join(DATASET_DIR, "pictures")
ORPHANS_DIR = os.path.join(DATASET_DIR, "pictures_orphans")
ETALONS_PATH = os.path.join(DATASET_DIR, "etalons.csv")

TABLES = {
    "product_checks": "product_checks_rows.csv",
    "products_reference": "products_reference_rows.csv"
}

def download_table(supabase: Client, table, filename):
    print(f"Downloading table {table}...")
    data = supabase.table(table).select("*").execute().data
    df = pd.DataFrame(data)
    out_path = os.path.join(DATASET_DIR, filename)
    _write_csv_safely(out_path, df)

def _write_csv_safely(path: str, df: pd.DataFrame) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        df.to_csv(path, index=False)
    except PermissionError:
        # Файл, вероятно, открыт (например, в Excel). Пишем во временный и пытаемся заменить.
        tmp = path + ".tmp"
        df.to_csv(tmp, index=False)
        try:
            os.replace(tmp, path)
        except PermissionError:
            # Совсем не получилось заменить — сохраняем с таймштампом.
            base, ext = os.path.splitext(os.path.basename(path))
            alt = os.path.join(os.path.dirname(path), f"{base}_{int(time.time())}{ext}")
            os.replace(tmp, alt)
            print(f"Внимание: файл заблокирован, не удалось перезаписать {path}. Сохранено как {alt}")

def download_pictures(supabase: Client):
    print("Downloading pictures...")
    # Некоторые версии supabase-py не поддерживают limit/offset в Storage.list.
    # Делаем один вызов без пагинации.
    files = supabase.storage.from_("documents").list("pictures")
    if not files:
        print("No files found in bucket 'documents/pictures'.")
        return

    for file in tqdm(files):
        # В некоторых версиях supabase-py возвращается dict, в некоторых — объект с атрибутом name.
        name = file.get("name") if isinstance(file, dict) else getattr(file, "name", None)
        if not name:
            continue
        url = supabase.storage.from_("documents").get_public_url(f"pictures/{name}")
        r = requests.get(url)
        r.raise_for_status()
        with open(os.path.join(PICTURES_DIR, name), "wb") as f:
            f.write(r.content)

def _detect_photo_column(df: pd.DataFrame) -> str:
    """Находим колонку с путём/именем фото в product_checks."""
    candidates = [
        "photo_path", "photo", "photo_url", "picture", "image_path", "image", "file_path"
    ]
    for col in candidates:
        if col in df.columns:
            return col
    # Если ничего не нашли — попробуем эвристику: первая строковая колонка, напоминающая путь
    for col in df.columns:
        if df[col].dtype == object:
            sample = str(df[col].dropna().head(1).values[0]) if df[col].dropna().shape[0] else ""
            if "/" in sample or "\\" in sample or sample.lower().endswith(('.jpg', '.jpeg', '.png', '.webp', '.bmp')):
                return col
    raise ValueError("Не удалось определить колонку с путём к фото в product_checks")


def recreate_metadata():
    print("Recreating metadata.csv (только парные записи)...")
    checks_path = os.path.join(DATASET_DIR, "product_checks_rows.csv")
    if not os.path.exists(checks_path):
        raise FileNotFoundError(f"Не найден {checks_path}. Сначала выгрузите таблицу product_checks.")

    checks = pd.read_csv(checks_path)
    photo_col = _detect_photo_column(checks)

    # Имя файла фото (basename) из product_checks
    checks["photo_name"] = (
        checks[photo_col]
        .astype(str)
        .apply(lambda x: os.path.basename(x) if x and x.lower() != "nan" else "")
    )

    # Список доступных фотографий в папке pictures
    if not os.path.isdir(PICTURES_DIR):
        os.makedirs(PICTURES_DIR, exist_ok=True)
    available_photos = {f for f in os.listdir(PICTURES_DIR) if os.path.isfile(os.path.join(PICTURES_DIR, f))}

    # Оставляем только парные записи: и строка есть, и фото файл присутствует
    paired_mask = checks["photo_name"].isin(available_photos) & (checks["photo_name"] != "")
    metadata = checks.loc[paired_mask].copy()
    metadata["file_path"] = metadata["photo_name"].apply(lambda n: f"pictures/{n}")

    # Подтягиваем названия продуктов из products_reference_rows.csv (если файл существует)
    ref_path = os.path.join(DATASET_DIR, "products_reference_rows.csv")
    if os.path.exists(ref_path):
        try:
            ref = pd.read_csv(ref_path)
            # Ожидаем колонки: ref.id, ref.name
            if "id" in ref.columns and "name" in ref.columns and "product_id" in metadata.columns:
                metadata = metadata.merge(
                    ref[["id", "name"]],
                    how="left",
                    left_on="product_id",
                    right_on="id",
                )
                # Переименуем name->product_name и удалим вспомогательный id из ref
                if "name" in metadata.columns:
                    metadata.rename(columns={"name": "product_name"}, inplace=True)
                if "id" in metadata.columns:
                    # Осторожно: в metadata уже есть свой id (из checks). Избежим конфликта имен.
                    # Если появились обе колонки 'id_x'/'id_y' — оставим исходный id из checks.
                    pass
                # Если после merge появились суффиксы, аккуратно почистим
                for col in list(metadata.columns):
                    if col.endswith("_y") and col[:-2] in metadata.columns:
                        # предпочитаем *_x как оригинал из checks
                        del metadata[col]
                    elif col.endswith("_x"):
                        # снимем суффикс _x
                        base = col[:-2]
                        if base not in metadata.columns:
                            metadata.rename(columns={col: base}, inplace=True)
        except Exception as e:
            print(f"Не удалось подгрузить products_reference_rows.csv: {e}")

    # Диагностика непарных
    rows_without_photos = checks.loc[~paired_mask]
    photos_with_rows = set(metadata["photo_name"].unique())
    photos_without_rows = sorted(list(available_photos - photos_with_rows))

    metadata_out = os.path.join(DATASET_DIR, "metadata.csv")
    metadata.to_csv(metadata_out, index=False)

    print("Metadata updated.")
    print(f"Всего строк в product_checks: {len(checks)}")
    print(f"Всего фотографий в папке: {len(available_photos)}")
    print(f"Сохранено парных записей: {len(metadata)}")
    print(f"Строк без фото: {len(rows_without_photos)}")
    print(f"Фотографий без строк: {len(photos_without_rows)}")
    if photos_without_rows:
        print("Примеры фотографий без строк:", ", ".join(photos_without_rows[:10]))

    # Перемещаем сиротские фото в отдельную папку и сохраняем список
    if photos_without_rows:
        os.makedirs(ORPHANS_DIR, exist_ok=True)
        moved = []
        for name in photos_without_rows:
            src = os.path.join(PICTURES_DIR, name)
            if not os.path.isfile(src):
                continue
            dest = os.path.join(ORPHANS_DIR, name)
            # Если файл уже существует в целевой папке, добавим таймштамп
            if os.path.exists(dest):
                base, ext = os.path.splitext(name)
                dest = os.path.join(ORPHANS_DIR, f"{base}_{int(time.time())}{ext}")
            try:
                shutil.move(src, dest)
                moved.append(os.path.basename(dest))
            except Exception as e:
                print(f"Не удалось переместить {name}: {e}")

        # Сохраняем список сиротских фото
        orphans_csv = os.path.join(DATASET_DIR, "orphan_photos.csv")
        try:
            pd.DataFrame({"file_name": moved}).to_csv(orphans_csv, index=False)
        except Exception as e:
            print(f"Не удалось сохранить список сиротских фото: {e}")
        print(f"Перемещено сиротских фото: {len(moved)} в {ORPHANS_DIR}")

def _parse_avg_lab(value: str) -> tuple[float, float, float] | None:
    try:
        if isinstance(value, (list, tuple)) and len(value) == 3:
            L, a, b = value
            return float(L), float(a), float(b)
        s = str(value).strip()
        if not s:
            return None
        # Формат вроде: "[72.89, -2.34, 3.18]"
        s = s.strip('[]')
        parts = [p.strip() for p in s.split(',')]
        if len(parts) != 3:
            return None
        L, a, b = map(float, parts)
        return L, a, b
    except Exception:
        return None

def rebuild_etalons_from_metadata():
    print("Rebuilding etalons.csv из metadata.csv...")
    meta_path = os.path.join(DATASET_DIR, "metadata.csv")
    if not os.path.exists(meta_path):
        print("metadata.csv не найден — пропускаю сборку etalons.csv")
        return

    df = pd.read_csv(meta_path)
    # Требуются product_name и avg_lab (или L,a,b)
    if "product_name" not in df.columns:
        print("В metadata.csv нет product_name — пропускаю сборку etalons.csv")
        return

    # Получим L,a,b
    if all(c in df.columns for c in ["L", "a", "b"]):
        lab_df = df[["product_name", "L", "a", "b", "rus_color_name"]].copy() if "rus_color_name" in df.columns else df[["product_name", "L", "a", "b"]].copy()
    else:
        # Парсим из avg_lab
        if "avg_lab" not in df.columns:
            print("В metadata.csv нет avg_lab и (L,a,b) — пропускаю сборку etalons.csv")
            return
        labs = df["avg_lab"].apply(_parse_avg_lab)
        lab_df = pd.DataFrame(labs.tolist(), columns=["L", "a", "b"])
        lab_df["product_name"] = df["product_name"].values
        if "rus_color_name" in df.columns:
            lab_df["rus_color_name"] = df["rus_color_name"].values

    # Удалим пустые
    lab_df = lab_df.dropna(subset=["product_name", "L", "a", "b"]).copy()

    # Агрегация по продукту: средние L,a,b, а rus_color_name — самый частый
    def mode_or_empty(series: pd.Series) -> str:
        try:
            return series.mode().iloc[0]
        except Exception:
            return ""

    agg_dict = {"L": "mean", "a": "mean", "b": "mean"}
    if "rus_color_name" in lab_df.columns:
        grouped = lab_df.groupby("product_name", as_index=False).agg({**agg_dict, "rus_color_name": mode_or_empty})
    else:
        grouped = lab_df.groupby("product_name", as_index=False).agg(agg_dict)

    # Сортировка для стабильности
    grouped = grouped.sort_values("product_name").reset_index(drop=True)

    # Запись
    _write_csv_safely(ETALONS_PATH, grouped)
    print(f"etalons.csv обновлён: {ETALONS_PATH} (строк: {len(grouped)})")

def _parse_cli_args():
    parser = argparse.ArgumentParser(description="Export from Supabase and rebuild metadata/etalon files")
    parser.add_argument("--pictures", action="store_true", help="Скачать фото из Supabase Storage")
    parser.add_argument("--checks", action="store_true", help="Выгрузить таблицу product_checks")
    parser.add_argument("--metadata", action="store_true", help="Пересобрать metadata.csv")
    parser.add_argument("--etalons", action="store_true", help="Пересобрать etalons.csv")
    parser.add_argument("--metadata-only", action="store_true", help="Быстро пересобрать metadata и etalons без Supabase")
    args = parser.parse_args()

    # Если ни одного флага не указано — выполняем полный сценарий как раньше
    if not any([args.pictures, args.checks, args.metadata, args.etalons, args.metadata_only]):
        args.pictures = True
        args.checks = True
        args.metadata = True
        args.etalons = True

    # metadata-only переопределяет флаги
    if args.metadata_only:
        args.pictures = False
        args.checks = False
        args.metadata = True
        args.etalons = True

    return args

def main():
    args = _parse_cli_args()

    # Клиент Supabase нужен только если заданы pictures или checks
    supabase = None
    if args.pictures or args.checks:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL/SUPABASE_KEY не заданы. Установите переменные окружения или добавьте их в .env"
            )
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    os.makedirs(PICTURES_DIR, exist_ok=True)

    # 1) Скачиваем фото
    if args.pictures and supabase is not None:
        download_pictures(supabase)
        print("Pictures export complete!")

    # 2) Выгружаем product_checks
    if args.checks and supabase is not None:
        download_table(supabase, "product_checks", TABLES["product_checks"])
        print("product_checks export complete!")

    # 3) Пересоздаём metadata только для парных записей
    if args.metadata:
        recreate_metadata()

    # 4) Пересобираем etalons.csv из свежей metadata
    if args.etalons:
        rebuild_etalons_from_metadata()

if __name__ == "__main__":
    main()
