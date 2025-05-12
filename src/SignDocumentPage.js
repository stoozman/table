import React, { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import './SignDocumentPage.css';

// Используем локальный pdf.worker.js из node_modules
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL}/pdf.worker.min.js`;
// Для create-react-app pdf.worker.min.js нужно скопировать в public/ вручную или через postinstall

function SignDocumentPage() {
  const [file, setFile] = useState(null);
  const [signatureImg, setSignatureImg] = useState(null);
  const [fioImg, setFioImg] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [insertMode, setInsertMode] = useState(null); // 'signature' or 'fio'
  const [positions, setPositions] = useState([]); // [{type, x, y, page}]
  const pdfWrapperRef = useRef(null);

  const onFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const onSignatureChange = (e) => {
    setSignatureImg(URL.createObjectURL(e.target.files[0]));
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
          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={onFileChange} />
        </label>
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
                style={{ left: pos.x, top: pos.y }}
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
                style={{ left: pos.x, top: pos.y }}
              />
            ))}
          </div>
        )}
      </div>
      <div className="controls-section">
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
