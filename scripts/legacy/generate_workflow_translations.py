#!/usr/bin/env python3
import re
from pathlib import Path

LANGS = {
    "fr": {"locale": "fr_FR"}, "es": {"locale": "es_ES"}, "de": {"locale": "de_DE"},
    "pt": {"locale": "pt_BR"}, "ja": {"locale": "ja_JP"}, "ru": {"locale": "ru_RU"},
    "hi": {"locale": "hi_IN"},
}

COMMON = {
    "fr": {"back": "← Retour", "all_tools": "Tous les outils", "about": "À propos",
           "footer": "Presend — outils gratuits basés sur le navigateur."},
    "es": {"back": "← Volver", "all_tools": "Todas las herramientas", "about": "Acerca de",
           "footer": "Presend — herramientas gratuitas basadas en navegador."},
    "de": {"back": "← Zurück", "all_tools": "Alle Werkzeuge", "about": "Über",
           "footer": "Presend — kostenlose browserbasierte Tools."},
    "pt": {"back": "← Voltar", "all_tools": "Todas as ferramentas", "about": "Sobre",
           "footer": "Presend — ferramentas gratuitas baseadas no navegador."},
    "ja": {"back": "← 戻る", "all_tools": "みんなのツール", "about": "概要",
           "footer": "Presend — 無料のブラウザベースのツール。"},
    "ru": {"back": "← Назад", "all_tools": "Все инструменты", "about": "О нас",
           "footer": "Presend — бесплатные браузерные инструменты."},
    "hi": {"back": "← वापस", "all_tools": "सभी उपकरण", "about": "जानकारी",
           "footer": "Presend — मुफ़्त ब्राउज़र-आधारित उपकरण।"},
}

TRANSLATIONS = {}

TRANSLATIONS["clean-and-compress-photo"] = {
    "fr": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "Nettoyer et compresser une photo — Workflow gratuit, sans upload | Presend",
        "Clean &amp; Compress Photo": "Nettoyer &amp; compresser une photo",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un workflow enchaîné : supprime les métadonnées EXIF/GPS cachées, puis compresse le résultat — en une seule fois, entièrement dans votre navigateur. Deux outils, un clic.",
        "Your files are never sent to our servers": "Vos fichiers ne sont jamais envoyés à nos serveurs",
        "Drop a photo here, or click to choose one": "Déposez une photo ici, ou cliquez pour en choisir une",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG ou WebP. Rien ne quitte votre appareil.",
        "Compression quality:": "Qualité de compression :",
        "1. Removing EXIF/GPS metadata…": "1. Suppression des métadonnées EXIF/GPS…",
        "2. Compressing…": "2. Compression…",
        "Download cleaned &amp; compressed photo": "Télécharger la photo nettoyée &amp; compressée",
        "Process another photo": "Traiter une autre photo",
    },
    "es": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "Limpiar y comprimir una foto — Flujo gratuito, sin subida | Presend",
        "Clean &amp; Compress Photo": "Limpiar &amp; comprimir foto",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un flujo encadenado: elimina los metadatos EXIF/GPS ocultos y luego comprime el resultado — en un solo paso, totalmente en tu navegador. Dos herramientas, un clic.",
        "Your files are never sent to our servers": "Tus archivos nunca se envían a nuestros servidores",
        "Drop a photo here, or click to choose one": "Suelta una foto aquí, o haz clic para elegir una",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG o WebP. Nada sale de tu dispositivo.",
        "Compression quality:": "Calidad de compresión:",
        "1. Removing EXIF/GPS metadata…": "1. Eliminando metadatos EXIF/GPS…",
        "2. Compressing…": "2. Comprimiendo…",
        "Download cleaned &amp; compressed photo": "Descargar foto limpia &amp; comprimida",
        "Process another photo": "Procesar otra foto",
    },
    "de": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "Foto bereinigen & komprimieren — Kostenloser Workflow, kein Upload | Presend",
        "Clean &amp; Compress Photo": "Foto bereinigen &amp; komprimieren",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Ein verketteter Workflow: entfernt versteckte EXIF/GPS-Metadaten und komprimiert dann das Ergebnis — in einem Durchgang, vollständig in Ihrem Browser. Zwei Tools, ein Klick.",
        "Your files are never sent to our servers": "Ihre Dateien werden niemals an unsere Server gesendet",
        "Drop a photo here, or click to choose one": "Foto hier ablegen oder klicken, um eines auszuwählen",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG oder WebP. Nichts verlässt Ihr Gerät.",
        "Compression quality:": "Komprimierungsqualität:",
        "1. Removing EXIF/GPS metadata…": "1. EXIF/GPS-Metadaten werden entfernt…",
        "2. Compressing…": "2. Komprimierung…",
        "Download cleaned &amp; compressed photo": "Bereinigtes &amp; komprimiertes Foto herunterladen",
        "Process another photo": "Weiteres Foto verarbeiten",
    },
    "pt": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "Limpar e comprimir uma foto — Fluxo gratuito, sem upload | Presend",
        "Clean &amp; Compress Photo": "Limpar &amp; comprimir foto",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Um fluxo encadeado: remove os metadados EXIF/GPS ocultos e depois comprime o resultado — em uma única etapa, totalmente no seu navegador. Duas ferramentas, um clique.",
        "Your files are never sent to our servers": "Seus arquivos nunca são enviados aos nossos servidores",
        "Drop a photo here, or click to choose one": "Solte uma foto aqui, ou clique para escolher uma",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG ou WebP. Nada sai do seu dispositivo.",
        "Compression quality:": "Qualidade de compressão:",
        "1. Removing EXIF/GPS metadata…": "1. Removendo metadados EXIF/GPS…",
        "2. Compressing…": "2. Comprimindo…",
        "Download cleaned &amp; compressed photo": "Baixar foto limpa &amp; comprimida",
        "Process another photo": "Processar outra foto",
    },
    "ja": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "写真をクリーニング＆圧縮 — 無料の連携ワークフロー、アップロード不要 | Presend",
        "Clean &amp; Compress Photo": "写真をクリーニング＆圧縮",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "連携ワークフロー：隠されたEXIF/GPSメタデータを削除し、結果を圧縮します — ブラウザ内で一度に処理。2つのツールをワンクリックで。",
        "Your files are never sent to our servers": "ファイルがサーバーに送信されることはありません",
        "Drop a photo here, or click to choose one": "写真をここにドロップするか、クリックして選択してください",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG、PNG、WebP対応。デバイスの外には何も送信されません。",
        "Compression quality:": "圧縮品質：",
        "1. Removing EXIF/GPS metadata…": "1. EXIF/GPSメタデータを削除中…",
        "2. Compressing…": "2. 圧縮中…",
        "Download cleaned &amp; compressed photo": "クリーニング＆圧縮済み写真をダウンロード",
        "Process another photo": "別の写真を処理",
    },
    "ru": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "Очистить и сжать фото — Бесплатный цепочный workflow, без загрузки | Presend",
        "Clean &amp; Compress Photo": "Очистить &amp; сжать фото",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Цепочка инструментов: удаляет скрытые EXIF/GPS-метаданные, затем сжимает результат — за один проход, полностью в браузере. Два инструмента, один клик.",
        "Your files are never sent to our servers": "Ваши файлы никогда не отправляются на наши серверы",
        "Drop a photo here, or click to choose one": "Перетащите фото сюда или нажмите, чтобы выбрать",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG или WebP. Ничего не покидает ваше устройство.",
        "Compression quality:": "Качество сжатия:",
        "1. Removing EXIF/GPS metadata…": "1. Удаление метаданных EXIF/GPS…",
        "2. Compressing…": "2. Сжатие…",
        "Download cleaned &amp; compressed photo": "Скачать очищенное &amp; сжатое фото",
        "Process another photo": "Обработать другое фото",
    },
    "hi": {
        "Clean & Compress a Photo — Free Chained Workflow, No Upload | Presend": "फोटो साफ़ करें और कंप्रेस करें — मुफ़्त चेन वर्कफ़्लो, अपलोड नहीं | Presend",
        "Clean &amp; Compress Photo": "फोटो साफ़ करें &amp; कंप्रेस करें",
        "A chained workflow: strips hidden EXIF/GPS metadata, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "एक चेन वर्कफ़्लो: छुपे हुए EXIF/GPS मेटाडेटा हटाता है, फिर परिणाम को कंप्रेस करता है — एक ही बार में, पूरी तरह से आपके ब्राउज़र में। दो टूल, एक क्लिक।",
        "Your files are never sent to our servers": "आपकी फ़ाइलें कभी भी हमारे सर्वर पर नहीं भेजी जातीं",
        "Drop a photo here, or click to choose one": "यहाँ फोटो डालें, या चुनने के लिए क्लिक करें",
        "JPG, PNG or WebP. Nothing leaves your device.": "JPG, PNG या WebP। आपके डिवाइस से कुछ भी बाहर नहीं जाता।",
        "Compression quality:": "कंप्रेशन गुणवत्ता:",
        "1. Removing EXIF/GPS metadata…": "1. EXIF/GPS मेटाडेटा हटाया जा रहा है…",
        "2. Compressing…": "2. कंप्रेस हो रहा है…",
        "Download cleaned &amp; compressed photo": "साफ़ &amp; कंप्रेस्ड फोटो डाउनलोड करें",
        "Process another photo": "दूसरी फोटो प्रोसेस करें",
    },
}

TRANSLATIONS["merge-and-compress-pdf"] = {
    "fr": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "Fusionner et compresser des PDF — Workflow gratuit, sans upload | Presend",
        "Merge &amp; Compress PDFs": "Fusionner &amp; compresser des PDF",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un workflow enchaîné : combine plusieurs PDF en un seul document, puis compresse le résultat — en une seule fois, entièrement dans votre navigateur. Deux outils, un clic.",
        "Drop PDF files here": "Déposez des fichiers PDF ici",
        "or click to browse": "ou cliquez pour parcourir",
        "Select 2 or more PDFs. Drag to reorder.": "Sélectionnez 2 PDF ou plus. Glissez pour réordonner.",
        "Merge &amp; Compress": "Fusionner &amp; compresser",
        "Clear all": "Tout effacer",
        "1. Merging PDFs…": "1. Fusion des PDF…",
        "2. Compressing…": "2. Compression…",
        "Download merged &amp; compressed PDF": "Télécharger le PDF fusionné &amp; compressé",
    },
    "es": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "Combinar y comprimir PDFs — Flujo gratuito, sin subida | Presend",
        "Merge &amp; Compress PDFs": "Combinar &amp; comprimir PDFs",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un flujo encadenado: combina varios PDFs en un solo documento y luego comprime el resultado — en un solo paso, totalmente en tu navegador. Dos herramientas, un clic.",
        "Drop PDF files here": "Suelta archivos PDF aquí",
        "or click to browse": "o haz clic para explorar",
        "Select 2 or more PDFs. Drag to reorder.": "Selecciona 2 o más PDFs. Arrastra para reordenar.",
        "Merge &amp; Compress": "Combinar &amp; comprimir",
        "Clear all": "Borrar todo",
        "1. Merging PDFs…": "1. Combinando PDFs…",
        "2. Compressing…": "2. Comprimiendo…",
        "Download merged &amp; compressed PDF": "Descargar PDF combinado &amp; comprimido",
    },
    "de": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "PDFs zusammenführen & komprimieren — Kostenloser Workflow, kein Upload | Presend",
        "Merge &amp; Compress PDFs": "PDFs zusammenführen &amp; komprimieren",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Ein verketteter Workflow: fasst mehrere PDFs zu einem Dokument zusammen und komprimiert dann das Ergebnis — in einem Durchgang, vollständig in Ihrem Browser. Zwei Tools, ein Klick.",
        "Drop PDF files here": "PDF-Dateien hier ablegen",
        "or click to browse": "oder klicken Sie zum Durchsuchen",
        "Select 2 or more PDFs. Drag to reorder.": "Wählen Sie 2 oder mehr PDFs aus. Ziehen zum Neuordnen.",
        "Merge &amp; Compress": "Zusammenführen &amp; komprimieren",
        "Clear all": "Alles löschen",
        "1. Merging PDFs…": "1. PDFs werden zusammengeführt…",
        "2. Compressing…": "2. Komprimierung…",
        "Download merged &amp; compressed PDF": "Zusammengeführtes &amp; komprimiertes PDF herunterladen",
    },
    "pt": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "Mesclar e comprimir PDFs — Fluxo gratuito, sem upload | Presend",
        "Merge &amp; Compress PDFs": "Mesclar &amp; comprimir PDFs",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Um fluxo encadeado: combina vários PDFs em um único documento e depois comprime o resultado — em uma única etapa, totalmente no seu navegador. Duas ferramentas, um clique.",
        "Drop PDF files here": "Solte arquivos PDF aqui",
        "or click to browse": "ou clique para procurar",
        "Select 2 or more PDFs. Drag to reorder.": "Selecione 2 ou mais PDFs. Arraste para reordenar.",
        "Merge &amp; Compress": "Mesclar &amp; comprimir",
        "Clear all": "Limpar tudo",
        "1. Merging PDFs…": "1. Mesclando PDFs…",
        "2. Compressing…": "2. Comprimindo…",
        "Download merged &amp; compressed PDF": "Baixar PDF mesclado &amp; comprimido",
    },
    "ja": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "PDFを結合＆圧縮 — 無料の連携ワークフロー、アップロード不要 | Presend",
        "Merge &amp; Compress PDFs": "PDFを結合＆圧縮",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "連携ワークフロー：複数のPDFを1つの文書に結合し、結果を圧縮します — ブラウザ内で一度に処理。2つのツールをワンクリックで。",
        "Drop PDF files here": "PDFファイルをここにドロップ",
        "or click to browse": "またはクリックして参照",
        "Select 2 or more PDFs. Drag to reorder.": "2つ以上のPDFを選択してください。ドラッグで並べ替え。",
        "Merge &amp; Compress": "結合＆圧縮",
        "Clear all": "すべてクリア",
        "1. Merging PDFs…": "1. PDFを結合中…",
        "2. Compressing…": "2. 圧縮中…",
        "Download merged &amp; compressed PDF": "結合＆圧縮済みPDFをダウンロード",
    },
    "ru": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "Объединить и сжать PDF — Бесплатный цепочный workflow, без загрузки | Presend",
        "Merge &amp; Compress PDFs": "Объединить &amp; сжать PDF",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Цепочка инструментов: объединяет несколько PDF в один документ, затем сжимает результат — за один проход, полностью в браузере. Два инструмента, один клик.",
        "Drop PDF files here": "Перетащите файлы PDF сюда",
        "or click to browse": "или нажмите для выбора",
        "Select 2 or more PDFs. Drag to reorder.": "Выберите 2 или более PDF. Перетащите для изменения порядка.",
        "Merge &amp; Compress": "Объединить &amp; сжать",
        "Clear all": "Очистить всё",
        "1. Merging PDFs…": "1. Объединение PDF…",
        "2. Compressing…": "2. Сжатие…",
        "Download merged &amp; compressed PDF": "Скачать объединённый &amp; сжатый PDF",
    },
    "hi": {
        "Merge & Compress PDFs — Free Chained Workflow, No Upload | Presend": "PDF मर्ज करें और कंप्रेस करें — मुफ़्त चेन वर्कफ़्लो, अपलोड नहीं | Presend",
        "Merge &amp; Compress PDFs": "PDF मर्ज करें &amp; कंप्रेस करें",
        "A chained workflow: combines multiple PDFs into one document, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "एक चेन वर्कफ़्लो: कई PDF को एक दस्तावेज़ में मिलाता है, फिर परिणाम को कंप्रेस करता है — एक ही बार में, पूरी तरह से आपके ब्राउज़र में। दो टूल, एक क्लिक।",
        "Drop PDF files here": "PDF फ़ाइलें यहाँ डालें",
        "or click to browse": "या ब्राउज़ करने के लिए क्लिक करें",
        "Select 2 or more PDFs. Drag to reorder.": "2 या अधिक PDF चुनें। क्रम बदलने के लिए खींचें।",
        "Merge &amp; Compress": "मर्ज करें &amp; कंप्रेस करें",
        "Clear all": "सभी साफ़ करें",
        "1. Merging PDFs…": "1. PDF मर्ज हो रहे हैं…",
        "2. Compressing…": "2. कंप्रेस हो रहा है…",
        "Download merged &amp; compressed PDF": "मर्ज्ड &amp; कंप्रेस्ड PDF डाउनलोड करें",
    },
}

TRANSLATIONS["convert-and-compress-heic"] = {
    "fr": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "Convertir HEIC en JPG et compresser — Workflow gratuit, sans upload | Presend",
        "Convert HEIC to JPG &amp; Compress": "Convertir HEIC en JPG &amp; compresser",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un workflow enchaîné : convertit une photo HEIC d'iPhone en JPG, puis compresse le résultat — en une seule fois, entièrement dans votre navigateur. Deux outils, un clic.",
        "Your files are never sent to our servers": "Vos fichiers ne sont jamais envoyés à nos serveurs",
        "Drop a HEIC photo here, or click to choose one": "Déposez une photo HEIC ici, ou cliquez pour en choisir une",
        ".heic or .heif. Nothing leaves your device.": ".heic ou .heif. Rien ne quitte votre appareil.",
        "Compression quality:": "Qualité de compression :",
        "1. Converting HEIC to JPG…": "1. Conversion HEIC vers JPG…",
        "2. Compressing…": "2. Compression…",
        "Download JPG": "Télécharger le JPG",
        "Process another photo": "Traiter une autre photo",
    },
    "es": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "Convertir HEIC a JPG y comprimir — Flujo gratuito, sin subida | Presend",
        "Convert HEIC to JPG &amp; Compress": "Convertir HEIC a JPG &amp; comprimir",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Un flujo encadenado: convierte una foto HEIC de iPhone a JPG y luego comprime el resultado — en un solo paso, totalmente en tu navegador. Dos herramientas, un clic.",
        "Your files are never sent to our servers": "Tus archivos nunca se envían a nuestros servidores",
        "Drop a HEIC photo here, or click to choose one": "Suelta una foto HEIC aquí, o haz clic para elegir una",
        ".heic or .heif. Nothing leaves your device.": ".heic o .heif. Nada sale de tu dispositivo.",
        "Compression quality:": "Calidad de compresión:",
        "1. Converting HEIC to JPG…": "1. Convirtiendo HEIC a JPG…",
        "2. Compressing…": "2. Comprimiendo…",
        "Download JPG": "Descargar JPG",
        "Process another photo": "Procesar otra foto",
    },
    "de": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "HEIC in JPG umwandeln & komprimieren — Kostenloser Workflow, kein Upload | Presend",
        "Convert HEIC to JPG &amp; Compress": "HEIC in JPG umwandeln &amp; komprimieren",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Ein verketteter Workflow: wandelt ein iPhone-HEIC-Foto in JPG um und komprimiert dann das Ergebnis — in einem Durchgang, vollständig in Ihrem Browser. Zwei Tools, ein Klick.",
        "Your files are never sent to our servers": "Ihre Dateien werden niemals an unsere Server gesendet",
        "Drop a HEIC photo here, or click to choose one": "HEIC-Foto hier ablegen oder klicken, um eines auszuwählen",
        ".heic or .heif. Nothing leaves your device.": ".heic oder .heif. Nichts verlässt Ihr Gerät.",
        "Compression quality:": "Komprimierungsqualität:",
        "1. Converting HEIC to JPG…": "1. HEIC wird in JPG umgewandelt…",
        "2. Compressing…": "2. Komprimierung…",
        "Download JPG": "JPG herunterladen",
        "Process another photo": "Weiteres Foto verarbeiten",
    },
    "pt": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "Converter HEIC para JPG e comprimir — Fluxo gratuito, sem upload | Presend",
        "Convert HEIC to JPG &amp; Compress": "Converter HEIC para JPG &amp; comprimir",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Um fluxo encadeado: converte uma foto HEIC do iPhone para JPG e depois comprime o resultado — em uma única etapa, totalmente no seu navegador. Duas ferramentas, um clique.",
        "Your files are never sent to our servers": "Seus arquivos nunca são enviados aos nossos servidores",
        "Drop a HEIC photo here, or click to choose one": "Solte uma foto HEIC aqui, ou clique para escolher uma",
        ".heic or .heif. Nothing leaves your device.": ".heic ou .heif. Nada sai do seu dispositivo.",
        "Compression quality:": "Qualidade de compressão:",
        "1. Converting HEIC to JPG…": "1. Convertendo HEIC para JPG…",
        "2. Compressing…": "2. Comprimindo…",
        "Download JPG": "Baixar JPG",
        "Process another photo": "Processar outra foto",
    },
    "ja": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "HEICをJPGに変換＆圧縮 — 無料の連携ワークフロー、アップロード不要 | Presend",
        "Convert HEIC to JPG &amp; Compress": "HEICをJPGに変換＆圧縮",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "連携ワークフロー：iPhoneのHEIC写真をJPGに変換し、結果を圧縮します — ブラウザ内で一度に処理。2つのツールをワンクリックで。",
        "Your files are never sent to our servers": "ファイルがサーバーに送信されることはありません",
        "Drop a HEIC photo here, or click to choose one": "HEIC写真をここにドロップするか、クリックして選択してください",
        ".heic or .heif. Nothing leaves your device.": ".heicまたは.heif対応。デバイスの外には何も送信されません。",
        "Compression quality:": "圧縮品質：",
        "1. Converting HEIC to JPG…": "1. HEICをJPGに変換中…",
        "2. Compressing…": "2. 圧縮中…",
        "Download JPG": "JPGをダウンロード",
        "Process another photo": "別の写真を処理",
    },
    "ru": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "Конвертировать HEIC в JPG и сжать — Бесплатный цепочный workflow, без загрузки | Presend",
        "Convert HEIC to JPG &amp; Compress": "Конвертировать HEIC в JPG &amp; сжать",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "Цепочка инструментов: конвертирует HEIC-фото iPhone в JPG, затем сжимает результат — за один проход, полностью в браузере. Два инструмента, один клик.",
        "Your files are never sent to our servers": "Ваши файлы никогда не отправляются на наши серверы",
        "Drop a HEIC photo here, or click to choose one": "Перетащите HEIC-фото сюда или нажмите, чтобы выбрать",
        ".heic or .heif. Nothing leaves your device.": ".heic или .heif. Ничего не покидает ваше устройство.",
        "Compression quality:": "Качество сжатия:",
        "1. Converting HEIC to JPG…": "1. Конвертация HEIC в JPG…",
        "2. Compressing…": "2. Сжатие…",
        "Download JPG": "Скачать JPG",
        "Process another photo": "Обработать другое фото",
    },
    "hi": {
        "Convert HEIC to JPG & Compress — Free Chained Workflow, No Upload | Presend": "HEIC को JPG में बदलें और कंप्रेस करें — मुफ़्त चेन वर्कफ़्लो, अपलोड नहीं | Presend",
        "Convert HEIC to JPG &amp; Compress": "HEIC को JPG में बदलें &amp; कंप्रेस करें",
        "A chained workflow: converts an iPhone HEIC photo to JPG, then compresses the result — in one pass, entirely in your browser. Two tools, one click.": "एक चेन वर्कफ़्लो: iPhone की HEIC फोटो को JPG में बदलता है, फिर परिणाम को कंप्रेस करता है — एक ही बार में, पूरी तरह से आपके ब्राउज़र में। दो टूल, एक क्लिक।",
        "Your files are never sent to our servers": "आपकी फ़ाइलें कभी भी हमारे सर्वर पर नहीं भेजी जातीं",
        "Drop a HEIC photo here, or click to choose one": "यहाँ HEIC फोटो डालें, या चुनने के लिए क्लिक करें",
        ".heic or .heif. Nothing leaves your device.": ".heic या .heif। आपके डिवाइस से कुछ भी बाहर नहीं जाता।",
        "Compression quality:": "कंप्रेशन गुणवत्ता:",
        "1. Converting HEIC to JPG…": "1. HEIC को JPG में बदला जा रहा है…",
        "2. Compressing…": "2. कंप्रेस हो रहा है…",
        "Download JPG": "JPG डाउनलोड करें",
        "Process another photo": "दूसरी फोटो प्रोसेस करें",
    },
}

# ─── GENERATION ──────────────────────────────────────────────────
def translate_html(html, tool, lang_code):
    lang_info = COMMON[lang_code]
    html = html.replace('<html lang="en">', f'<html lang="{lang_code}">')
    html = html.replace(f'href="https://presend.pages.dev/tools/{tool}"', f'href="https://presend.pages.dev/{lang_code}/tools/{tool}"')
    html = html.replace('href="/tools/', f'href="/{lang_code}/tools/')
    html = html.replace("href='/tools/", f"href='/{lang_code}/tools/")
    html = html.replace("href='/'", f"href='/{lang_code}/'")
    html = html.replace('href="../style.min.css"', 'href="../../style.min.css"')
    html = html.replace('href="/js/', 'href="/js/')  # keep JS paths absolute (unaffected by lang prefix)
    html = html.replace('src="/js/', 'src="/js/')
    html = html.replace('src="/vendor/', 'src="/vendor/')
    html = html.replace('>All tools<', f'>{lang_info["all_tools"]}<')
    html = html.replace("<a class='tool-back' href='/{}/'>← Back<".format(lang_code), "PLACEHOLDER")  # no-op guard

    # Replace ← Back specifically (was already lang-prefixed above via href rule)
    html = html.replace('>← Back<', f'>{lang_info["back"]}<')
    html = html.replace('>About<', f'>{lang_info["about"]}<')
    html = html.replace(
        'Presend — free browser-based tools.',
        lang_info["footer"]
    )

    # Apply the tool-specific string translations
    for en_str, translated in TRANSLATIONS.get(tool, {}).get(lang_code, {}).items():
        html = html.replace(en_str, translated)

    return html

def main():
    tools = ["clean-and-compress-photo", "merge-and-compress-pdf", "convert-and-compress-heic"]
    total = len(tools) * len(LANGS)
    current = 0
    for tool in tools:
        en_path = Path(f"tools/{tool}.html")
        if not en_path.exists():
            print(f"❌ Fichier source manquant: {en_path}")
            continue
        html = en_path.read_text(encoding="utf-8")
        for lang_code in LANGS:
            current += 1
            out_dir = Path(f"{lang_code}/tools")
            out_dir.mkdir(parents=True, exist_ok=True)
            translated = translate_html(html, tool, lang_code)
            out_path = out_dir / f"{tool}.html"
            out_path.write_text(translated, encoding="utf-8")
            print(f"[{current}/{total}] {tool} -> {lang_code} OK ({len(translated)} chars)")
    print(f"\nTerminé. {total} fichiers générés.")

if __name__ == "__main__":
    main()
