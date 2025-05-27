import React, { useState, useEffect, useRef } from 'react';
import { saveDocumentToDropbox, getDropboxShareableLink, deleteDocumentFromDropbox, listDropboxFiles, createDropboxFolder } from './utils/documentGenerator';
import { PDFDocument } from 'pdf-lib';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import './SignDocumentPage.css';

pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;

export default function SignDocumentSignPage() {
  const [unsignedDocs, setUnsignedDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [file, setFile] = useState(null);
  const [currentUnsignedDoc, setCurrentUnsignedDoc] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [signatureImg, setSignatureImg] = useState(null);
  const [signatureLoaded, setSignatureLoaded] = useState(false);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [insertMode, setInsertMode] = useState(null); // 'signature'
  const [positions, setPositions] = useState([]); // [{type, x, y, page}]
  const pdfWrapperRef = useRef(null);

  useEffect(() => {
    async function fetchLists() {
      setLoadingDocs(true);
      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
      await createDropboxFolder('/documents/unsigned', accessToken);
      const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
      setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
      setLoadingDocs(false);
    }
    fetchLists();
  }, []);

  useEffect(() => {
    setPositions([]);
  }, [file]);

  useEffect(() => {
    async function restoreSignature() {
      const local = localStorage.getItem('signatureDataUrl');
      if (local) {
        setSignatureImg(local);
        setSignatureLoaded(true);
        return;
      }
      try {
        const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
        const link = await getDropboxShareableLink('signatures/signature.png', accessToken);
        if (link) {
          setSignatureImg(link);
          setSignatureLoaded(true);
        }
      } catch (err) {
        setSignatureLoaded(false);
      }
    }
    restoreSignature();
  }, []);

  const onSignatureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.match('image/.*')) {
      alert('Пожалуйста, загрузите файл изображения (PNG, JPG, JPEG)');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result;
      setSignatureFile(file);
      setSignatureImg(dataUrl);
      localStorage.setItem('signatureDataUrl', dataUrl);
      try {
        const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
        await createDropboxFolder('/signatures', accessToken);
        await saveDocumentToDropbox(file, '/signatures/signature.png', accessToken);
        setSignatureLoaded(true);
        alert('Подпись успешно сохранена!');
      } catch (err) {
        alert('Ошибка при сохранении подписи. Пожалуйста, попробуйте снова.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteSignature = async () => {
    if (window.confirm('Вы уверены, что хотите удалить подпись? Это действие нельзя отменить.')) {
      try {
        const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
        await deleteDocumentFromDropbox('/signatures/signature.png', accessToken);
        setSignatureFile(null);
        setSignatureImg(null);
        setSignatureLoaded(false);
        localStorage.removeItem('signatureDataUrl');
      } catch (err) {
        alert('Не удалось удалить подпись. Пожалуйста, попробуйте снова.');
      }
    }
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
      <h2>Подписание документа</h2>
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
                      const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
                      const link = await getDropboxShareableLink(doc.path_display, accessToken);
                      const response = await fetch(link);
                      const blob = await response.blob();
                      setFile(new File([blob], doc.name, { type: blob.type }));
                      setCurrentUnsignedDoc(doc);
                      setPositions([]);
                      setPageNumber(1);
                    }}>Открыть</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="signature-upload">
        <label>Изображение подписи:
          <input type="file" accept="image/*" onChange={onSignatureChange} />
        </label>
        {signatureLoaded && (
          <button 
            type="button" 
            onClick={handleDeleteSignature}
            style={{ marginLeft: '10px', color: 'red' }}
            title="Удалить подпись"
          >
            Удалить подпись
          </button>
        )}
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
            {positions.filter(pos => pos.page === pageNumber).map((pos, idx) => (
              <img
                key={idx}
                src={signatureImg}
                alt={pos.type}
                className="overlay-img"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: 100,
                  height: 50,
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
                src={signatureImg}
                alt={pos.type}
                className="overlay-img"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: 100,
                  height: 50,
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="controls-section">
        {file && currentUnsignedDoc && (
          <button style={{margin:'10px 0'}} onClick={async () => {
            let signedBlob = file;
            const pos = positions.find(p => p.type === 'signature');
            if (!pos) {
              alert('Пожалуйста, укажите позицию для подписи (кнопка "Вставить подпись")!');
              return;
            }
            if (!signatureImg) {
              alert('Ошибка: подпись должна быть загружена через input!');
              return;
            }
            let signatureDataUrl = signatureImg;
            if (signatureFile) {
              signatureDataUrl = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(signatureFile);
              });
            }
            if (file.type === 'application/pdf') {
              const pdfBytes = await file.arrayBuffer();
              const pdfDoc = await PDFDocument.load(pdfBytes);
              const pages = pdfDoc.getPages();
              const page = pages[(pos.page || 1) - 1] || pages[0];
              const pngImageBytes = await fetch(signatureDataUrl).then(r => r.arrayBuffer());
              const pngImage = await pdfDoc.embedPng(pngImageBytes);
              const { width, height } = page.getSize();
              const scale = 0.25;
              const imgWidth = pngImage.width * scale;
              const imgHeight = pngImage.height * scale;
              const pdfElem = document.querySelector('.pdf-wrapper canvas');
              let xPdf = 40, yPdf = 40;
              if (pdfElem) {
                const domWidth = pdfElem.width;
                const domHeight = pdfElem.height;
                xPdf = (pos.x / domWidth) * width;
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
            } else if (file.type === 'image/png' || file.type === 'image/jpeg') {
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
              ctx.drawImage(signImg, pos.x, pos.y, signImg.width * 0.25, signImg.height * 0.25);
              const dataUrl = canvas.toDataURL(file.type);
              const resBlob = await (await fetch(dataUrl)).blob();
              signedBlob = new File([resBlob], file.name, { type: file.type });
            } else {
              alert('Неизвестный формат файла для подписания!');
              return;
            }
            const accessToken = process.env.REACT_APP_DROPBOX_ACCESS_TOKEN;
            await createDropboxFolder('/documents/signed', accessToken);
            let newFileName = window.prompt('Введите имя для подписанного файла (без расширения):', currentUnsignedDoc.name.replace(/\.[^.]+$/, ''));
            if (!newFileName) {
              alert('Имя файла не задано!');
              return;
            }
            newFileName = newFileName.replace(/[\\/:*?"<>|]/g, '').trim();
            const ext = currentUnsignedDoc.name.split('.').pop();
            const finalFileName = `${newFileName}.${ext}`;
            try {
              await saveDocumentToDropbox(signedBlob, `/documents/signed/${finalFileName}`, accessToken);
            } catch (err) {
              alert('Ошибка при сохранении подписанного файла в Dropbox!');
              return;
            }
            try {
              await deleteDocumentFromDropbox(currentUnsignedDoc.path_display, accessToken);
            } catch (err) {
              alert('Ошибка при удалении исходного файла из Dropbox!');
              return;
            }
            try {
              const unsigned = await listDropboxFiles('/documents/unsigned', accessToken);
              setUnsignedDocs(unsigned.filter(f => f['.tag'] === 'file'));
            } catch (err) {
              alert('Ошибка при обновлении списков документов!');
              return;
            }
            setFile(null);
            setCurrentUnsignedDoc(null);
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
      </div>
    </div>
  );
}
