import React, { useState, useRef, useEffect } from 'react';
import { saveDocumentToDropbox, getDropboxShareableLink, deleteDocumentFromDropbox, listDropboxFiles, createDropboxFolder } from './utils/documentGenerator';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './SignDocumentPage.css';

// Используем локальный pdf.worker.js из node_modules
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;
// Для create-react-app pdf.worker.min.js нужно скопировать в public/ вручную или через postinstall

function SignDocumentPage() {
  const [unsignedDocs, setUnsignedDocs] = useState([]);
  const [signedDocs, setSignedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Получаем списки документов из Dropbox
  useEffect(() => {
    async function fetchLists() {
      setLoadingDocs(true);
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      await createDropboxFolder('/documents/unsigned', accessToken);
      await createDropboxFolder('/documents/signed', accessToken);
      const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
      const signed = await listDropboxFiles('/documents/signed', accessToken);
      setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
      setSignedDocs(signed.filter(f => f['.tag'] === 'file'));
      setLoadingDocs(false);
    }
    fetchLists();
  }, []);
  const [docStatus, setDocStatus] = useState('none'); // none, unsigned, signed
  const [signedDocLink, setSignedDocLink] = useState(null);
  const [currentUnsignedDoc, setCurrentUnsignedDoc] = useState(null); // выбранный для подписания

  // Проверка наличия документов в Dropbox
  useEffect(() => {
    async function checkDocStatus() {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      try {
        // Пробуем получить ссылку на подписанный документ
        const signedLink = await getDropboxShareableLink('documents/signed.pdf', accessToken);
        if (signedLink) {
          setDocStatus('signed');
          setSignedDocLink(signedLink);
          return;
        }
      } catch (err) {
        if (!(err.response && err.response.data && err.response.data.error_summary && err.response.data.error_summary.startsWith('path/not_found'))) {
          console.error('Ошибка получения temporary link для signed.pdf:', err.response ? err.response.data : err.message);
        }
      }
      try {
        // Если нет подписанного, пробуем получить ссылку на неподписанный
        const unsignedLink = await getDropboxShareableLink('documents/unsigned.pdf', accessToken);
        if (unsignedLink) {
          setDocStatus('unsigned');
          setSignedDocLink(null);
          return;
        }
      } catch (err) {
        if (!(err.response && err.response.data && err.response.data.error_summary && err.response.data.error_summary.startsWith('path/not_found'))) {
          console.error('Ошибка получения temporary link для unsigned.pdf:', err.response ? err.response.data : err.message);
        }
      }
      setDocStatus('none');
      setSignedDocLink(null);
    }
    checkDocStatus();
  }, []);
  // При монтировании проверяем, есть ли подпись в Dropbox
  // При монтировании страницы пытаемся восстановить подпись из localStorage или Dropbox
  useEffect(() => {
    async function restoreSignature() {
      const local = localStorage.getItem('signatureDataUrl');
      if (local) {
        // Восстанавливаем из localStorage
        setSignatureImg(local);
        // Преобразуем в File для вставки
        const res = await fetch(local);
        const blob = await res.blob();
        setSignatureFile(new File([blob], 'signature.png', { type: blob.type }));
        setSignatureLoaded(true);
        return;
      }
      // Если нет в localStorage — пробуем из Dropbox
      try {
        const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
        const link = await getDropboxShareableLink('signatures/signature.png', accessToken);
        if (link) {
          const res = await fetch(link);
          const blob = await res.blob();
          // Преобразуем в dataURL для предпросмотра и localStorage
          const reader = new FileReader();
          reader.onloadend = () => {
            setSignatureImg(reader.result);
            setSignatureFile(new File([blob], 'signature.png', { type: blob.type }));
            localStorage.setItem('signatureDataUrl', reader.result);
            setSignatureLoaded(true);
          };
          reader.readAsDataURL(blob);
        }
      } catch (err) {
        setSignatureLoaded(false);
      }
    }
    restoreSignature();
  }, []);
  const [file, setFile] = useState(null);
// Сброс только позиций при смене файла (подпись НЕ сбрасывается)
useEffect(() => {
  setPositions([]);
}, [file]);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileExt, setUploadFileExt] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [signatureFile, setSignatureFile] = useState(null); // локальный файл подписи
  const [signatureImg, setSignatureImg] = useState(null); // preview (dataURL)
  const [signatureLoaded, setSignatureLoaded] = useState(false);
  const [fioImg, setFioImg] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [insertMode, setInsertMode] = useState(null); // 'signature' or 'fio'
  const [positions, setPositions] = useState([]); // [{type, x, y, page}]
  const pdfWrapperRef = useRef(null);

  // Сброс только позиций при смене файла (подпись НЕ сбрасывается)
  useEffect(() => {
    setPositions([]);
  }, [file]);

  const onFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Запросить имя файла у пользователя
    let newFileName = window.prompt('Введите имя для загружаемого документа (без расширения):', file.name.replace(/\.[^.]+$/, ''));
    if (!newFileName) {
      alert('Имя файла не задано!');
      return;
    }
    // Удалить запрещённые символы для Dropbox
    newFileName = newFileName.replace(/[\\/:*?"<>|]/g, '').trim();
    // Получить расширение исходного файла
    const ext = file.name.split('.').pop();
    const finalFileName = `${newFileName}.${ext}`;
    setFile(new File([file], finalFileName, { type: file.type }));
    setCurrentUnsignedDoc(null); // сбросить текущий документ
    // Сохраняем документ в Dropbox с пользовательским именем
    try {
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      await createDropboxFolder('/documents/unsigned', accessToken);
      await saveDocumentToDropbox(file, `/documents/unsigned/${finalFileName}`, accessToken);
      // Обновить список
      const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
      setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
    } catch (err) {
      alert('Ошибка загрузки документа в Dropbox');
    }
  };

  const onSignatureChange = async (e) => {
    const file = e.target.files[0];
    // Преобразуем в dataURL для localStorage
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      setSignatureFile(file);
      setSignatureImg(dataUrl);
      localStorage.setItem('signatureDataUrl', dataUrl);
      // Сохраняем подпись в Dropbox
      try {
        const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
        await saveDocumentToDropbox(file, 'signatures/signature.png', accessToken);
        setSignatureLoaded(true);
      } catch (err) {
        alert('Ошибка загрузки подписи в Dropbox');
      }
    };
    reader.readAsDataURL(file);
  };

  const onFioChange = (e) => {
    setFioImg(URL.createObjectURL(e.target.files[0]));
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const handlePdfClick = (e) => {
    if (!insertMode) return;
    const rect = pdfWrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPositions([...positions, {
      type: insertMode,
      x,
      y,
      page: pageNumber
    }]);
    setInsertMode(null);
  };

  return (
    <div className="sign-doc-container">
      <h2>Подпись документа</h2>
      <div className="upload-section">
        <label>Загрузить документ (PDF/JPG/PNG):
          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={e => {
            const file = e.target.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop();
            setFile(file);
            setUploadFileName(file.name.replace(/\.[^.]+$/, ''));
            setUploadFileExt(ext);
            setShowUploadForm(true);
          }} />
        </label>
        {showUploadForm && file && (
          <form style={{marginTop:12}} onSubmit={async (ev) => {
            ev.preventDefault();
            let name = uploadFileName.replace(/[\\/:*?"<>|]/g, '').trim();
            if (!name) {
              alert('Имя файла не задано!');
              return;
            }
            const finalFileName = `${name}.${uploadFileExt}`;
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
            await createDropboxFolder('/documents/unsigned', accessToken);
            await saveDocumentToDropbox(file, `/documents/unsigned/${finalFileName}`, accessToken);
            // Обновить списки
            const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
            setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
            setShowUploadForm(false);
            setFile(null);
            setUploadFileName('');
            setUploadFileExt('');
            alert('Документ успешно загружен!');
          }}>
            <div>
              <label>Имя файла: </label>
              <input type="text" value={uploadFileName} onChange={e => setUploadFileName(e.target.value)} />
              .{uploadFileExt}
            </div>
            <button type="submit">Сохранить в Dropbox</button>
            <button type="button" style={{marginLeft:8}} onClick={() => { setShowUploadForm(false); setFile(null); }}>Отмена</button>
          </form>
        )}

        <label>Загрузить изображение подписи:
          <input type="file" accept="image/*" onChange={onSignatureChange} />
        </label>
        <label>Загрузить изображение ФИО:
          <input type="file" accept="image/*" onChange={onFioChange} />
        </label>
      </div>
      <div className="preview-section">
        {file && file.type === 'application/pdf' && (
          <div ref={pdfWrapperRef} className="pdf-wrapper" onClick={handlePdfClick}>
            <Document
              file={file}
              onLoadSuccess={onDocumentLoadSuccess}
            >
              <Page pageNumber={pageNumber} />
            </Document>
            {/* Overlay for signature/fio placement preview */}
            {positions.filter(pos => pos.page === pageNumber).map((pos, idx) => (
              <img
                key={idx}
                src={pos.type === 'signature' ? signatureImg : fioImg}
                alt={pos.type}
                className="overlay-img"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: pos.type === 'signature' ? 100 : 200, // adjust width based on signature or fio
                  height: pos.type === 'signature' ? 50 : 100, // adjust height based on signature or fio
                }}
              />
            ))}
          </div>
        )}
        {file && file.type !== 'application/pdf' && (
          <div className="img-wrapper" ref={pdfWrapperRef} onClick={handlePdfClick}>
            <img src={URL.createObjectURL(file)} alt="doc-preview" className="doc-img" />
            {positions.filter(pos => pos.page === 1).map((pos, idx) => (
              <img
                key={idx}
                src={pos.type === 'signature' ? signatureImg : fioImg}
                alt={pos.type}
                className="overlay-img"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: pos.type === 'signature' ? 100 : 200, // adjust width based on signature or fio
                  height: pos.type === 'signature' ? 50 : 100, // adjust height based on signature or fio
                }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Списки документов */}
      <div style={{margin: '16px 0'}}>
        <h3>Документы на подпись</h3>
        {loadingDocs ? <div>Загрузка...</div> : (
          unsignedDocs.length === 0 ? <div style={{color: 'gray'}}>Нет документов на подпись</div> :
          <table style={{width: '100%', marginBottom: 16}}>
            <thead><tr><th>Имя файла</th><th>Действия</th></tr></thead>
            <tbody>
              {unsignedDocs.map(doc => (
                <tr key={doc.id}>
                  <td>{doc.name}</td>
                  <td>
                    <button onClick={async () => {
                      // Открыть для подписания: загружаем файл и отображаем в интерфейсе
                      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
                      const link = await getDropboxShareableLink(doc.path_display, accessToken);
                      // Загружаем файл для подписания (PDF/JPG/PNG)
                      const response = await fetch(link);
                      const blob = await response.blob();
                      setFile(new File([blob], doc.name, { type: blob.type }));
                      setCurrentUnsignedDoc(doc); // Для дальнейшего сохранения
                      // Сброс позиций подписи
                      setPositions([]);
                    }}>Открыть</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h2>Подписанные документы</h2>
        {signedDocs.length === 0 && <div>Нет подписанных документов</div>}
        <ul>
          {signedDocs.map(doc => (
            <li key={doc.id || doc.name}>
              <a href="#" onClick={async (e) => {
                e.preventDefault();
                const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
                try {
                  const link = await getDropboxShareableLink(doc.path_display, accessToken);
                  window.open(link, '_blank');
                } catch (err) {
                  alert('Ошибка получения ссылки на файл');
                }
              }}>{doc.name}</a>
              {' '}
              <button style={{marginLeft:8}} onClick={async () => {
                if (!window.confirm(`Удалить файл "${doc.name}"? Это действие необратимо!`)) return;
                const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
                await deleteDocumentFromDropbox(doc.path_display, accessToken);
                setSignedDocs(signedDocs.filter(f => f.id !== doc.id && f.name !== doc.name));
              }}>Удалить</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="controls-section">
        {/* Кнопка подписать и сохранить */}
        {file && currentUnsignedDoc && (
          <button style={{margin:'10px 0'}} onClick={async () => {
            // --- Добавление подписи ---
            let signedBlob = file;
            const pos = positions.find(p => p.type === 'signature');
            console.log('[SIGN] Исходный файл:', file);
            if (!pos) {
              alert('Пожалуйста, укажите позицию для подписи (кнопка "Вставить подпись")!');
              return;
            }
            if (!signatureFile) {
              alert('Ошибка: подпись должна быть загружена через input!');
              return;
            }
            // Получаем изображение подписи как dataURL
            let signatureDataUrl = signatureImg;
            if (signatureFile) {
              signatureDataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(signatureFile);
              });
            }
            if (file.type === 'application/pdf') {
              console.log('[SIGN] Подписываем PDF...');
              // PDF: используем pdf-lib
              const pdfBytes = await file.arrayBuffer();
              const pdfDoc = await PDFDocument.load(pdfBytes);
              const pages = pdfDoc.getPages();
              const page = pages[(pos.page || 1) - 1] || pages[0];
              // Загружаем подпись в pdf-lib
              const pngImageBytes = await fetch(signatureDataUrl).then(r => r.arrayBuffer());
              const pngImage = await pdfDoc.embedPng(pngImageBytes);
              // Переводим координаты из px в точки PDF (примерно)
              const { width, height } = page.getSize();
              const scale = 0.25; // масштаб подписи
              const imgWidth = pngImage.width * scale;
              const imgHeight = pngImage.height * scale;
              // Переводим координаты из px (DOM) в PDF-координаты
              // Получаем размеры DOM-элемента
              const pdfElem = document.querySelector('.pdf-wrapper canvas');
              let xPdf = 40, yPdf = 40;
              if (pdfElem) {
                const domWidth = pdfElem.width;
                const domHeight = pdfElem.height;
                xPdf = (pos.x / domWidth) * width;
                // PDF-координаты: (0,0) — внизу слева, DOM — сверху слева
                yPdf = height - ((pos.y / domHeight) * height) - imgHeight;
              }
              page.drawImage(pngImage, {
                x: xPdf,
                y: yPdf,
                width: imgWidth,
                height: imgHeight
              });
              const signedBytes = await pdfDoc.save();
              signedBlob = new Blob([signedBytes], { type: 'application/pdf' });
              console.log('[SIGN] PDF подписан, размер:', signedBlob.size);
            } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
              // Подписываем изображение (PNG/JPEG)
              const canvas = document.createElement('canvas');
              const img = new window.Image();
              img.src = URL.createObjectURL(file);
              await new Promise(resolve => { img.onload = resolve; });
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              const signImg = new window.Image();
              signImg.src = URL.createObjectURL(signatureFile);
              await new Promise(resolve => { signImg.onload = resolve; });
              // Для изображений: используем реальные px, но учитываем масштаб подписи
              ctx.drawImage(signImg, pos.x, pos.y, signImg.width * 0.25, signImg.height * 0.25);
              const dataUrl = canvas.toDataURL(file.type);
              const resBlob = await (await fetch(dataUrl)).blob();
              signedBlob = new File([resBlob], file.name, { type: file.type });
              console.log('[SIGN] Изображение подписано, размер:', signedBlob.size);
            } else {
              alert('Неизвестный формат файла для подписания!');
              return;
            }
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
            console.log('[SIGN] Сохраняем подписанный файл в Dropbox:', signedBlob);
            await createDropboxFolder('/documents/signed', accessToken);
            // Запросить имя файла у пользователя
            let newFileName = window.prompt('Введите имя для подписанного файла (без расширения):', currentUnsignedDoc.name.replace(/\.[^.]+$/, ''));
            if (!newFileName) {
              alert('Имя файла не задано!');
              return;
            }
            // Удалить запрещённые символы для Dropbox
            newFileName = newFileName.replace(/[\\/:*?"<>|]/g, '').trim();
            // Получить расширение исходного файла
            const ext = currentUnsignedDoc.name.split('.').pop();
            const finalFileName = `${newFileName}.${ext}`;
            // 1. Сохраняем подписанный файл
            try {
              await saveDocumentToDropbox(signedBlob, `/documents/signed/${finalFileName}`, accessToken);
              console.log('[SIGN] Файл успешно сохранён в Dropbox:', `/documents/signed/${finalFileName}`);
            } catch (err) {
              console.error('[SIGN][ERROR] Ошибка при сохранении файла в Dropbox:', err);
              alert('Ошибка при сохранении подписанного файла в Dropbox!');
              return;
            }
            // 2. Удаляем исходный неподписанный файл
            try {
              await deleteDocumentFromDropbox(currentUnsignedDoc.path_display, accessToken);
              console.log('[SIGN] Исходный неподписанный файл удалён из Dropbox:', currentUnsignedDoc.path_display);
            } catch (err) {
              console.error('[SIGN][ERROR] Ошибка при удалении исходного файла из Dropbox:', err);
              alert('Ошибка при удалении исходного файла из Dropbox!');
              return;
            }
            // 3. Обновить списки
            try {
              const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
              setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
              const signed = await listDropboxFiles('/documents/signed', accessToken);
              setSignedDocs(signed.filter(f => f['.tag'] === 'file'));
              console.log('[SIGN] Списки документов обновлены:', {
                unsigned,
                signed
              });
            } catch (err) {
              console.error('[SIGN][ERROR] Ошибка при обновлении списков документов:', err);
              alert('Ошибка при обновлении списков документов!');
              return;
            }
            setFile(null);
            setCurrentUnsignedDoc(null);
            // Явно обновляем списки через fetchLists для гарантированного рендера
            if (typeof fetchLists === 'function') {
              fetchLists();
            }
            alert('Документ подписан и перемещён!');
          }}>Подписать и сохранить</button>
        )}

        {file && file.type === 'application/pdf' && numPages > 1 && (
          <div className="page-controls">
            <button onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}>Назад</button>
            <span>Страница {pageNumber} из {numPages}</span>
            <button onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}>Вперёд</button>
          </div>
        )}
        <button disabled={!signatureImg} onClick={() => setInsertMode('signature')}>Вставить подпись</button>
        <button disabled={!fioImg} onClick={() => setInsertMode('fio')}>Вставить ФИО</button>
      </div>
      
{/* TODO: Кнопка сохранения результата (PDF или PNG) */}
    </div>
  );
}

export default SignDocumentPage;
