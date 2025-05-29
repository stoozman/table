// Несущественный комментарий для теста git-коммита
import React, { useState, useEffect } from 'react';
import { saveDocumentToDropbox, getDropboxShareableLink, deleteDocumentFromDropbox, listDropboxFiles, createDropboxFolder } from './utils/documentGenerator';
import './SignDocumentPage.css';

export default function SignDocumentUploadPage() {
  const [unsignedDocs, setUnsignedDocs] = useState([]);
  const [signedDocs, setSignedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [file, setFile] = useState(null);
  const [uploadFileName, setUploadFileName] = useState('');
  const [uploadFileExt, setUploadFileExt] = useState('');
  const [showUploadForm, setShowUploadForm] = useState(false);

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

  return (
    <div className="sign-doc-container">
      <h2>Загрузка документа</h2>
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
      </div>
      <div style={{margin: '16px 0'}}>
        <h3>Документы на подпись</h3>
        {loadingDocs ? <div>Загрузка...</div> : (
          unsignedDocs.length === 0 ? <div style={{color: 'gray'}}>Нет документов на подпись</div> :
          <table style={{width: '100%', marginBottom: 16}}>
            <thead><tr><th>Имя файла</th></tr></thead>
            <tbody>
              {unsignedDocs.map(doc => (
                <tr key={doc.id}>
                  <td>{doc.name}</td>
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
    </div>
  );
}
