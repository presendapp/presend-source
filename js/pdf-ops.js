/*
 * PresendPdfOps — reusable, chainable client-side PDF operations.
 * Requires PDFLib (vendor/pdf-lib.min.js) to be loaded first.
 * Every function takes File/Blob(s) in and returns a Promise<Blob> out,
 * so operations can be composed into workflows. Nothing ever leaves
 * the browser: all processing happens via pdf-lib in-memory.
 */
(function (global) {

  async function mergePdfs(files) {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(pdf, pdf.getPageIndices());
      pages.forEach(p => merged.addPage(p));
    }
    const outBytes = await merged.save();
    return new Blob([outBytes], { type: 'application/pdf' });
  }

  async function compressPdf(fileOrBlob) {
    const originalBytes = await fileOrBlob.arrayBuffer();
    const pdfDoc = await PDFLib.PDFDocument.load(originalBytes, { updateMetadata: false });

    // Strip metadata that can bloat the file and leak info
    pdfDoc.setTitle('');
    pdfDoc.setAuthor('');
    pdfDoc.setSubject('');
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer('');
    pdfDoc.setCreator('');

    const compressedBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    });
    return new Blob([compressedBytes], { type: 'application/pdf' });
  }

  global.PresendPdfOps = { mergePdfs, compressPdf };
})(window);
