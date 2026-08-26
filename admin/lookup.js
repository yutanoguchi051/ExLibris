// ISBNから書誌情報を取得する（ブラウザから直接APIを呼び出す）。
// 1) openBD（日本語書籍向け、CORS対応・キー不要）
// 2) 見つからない項目は Google Books API で補完
// 必要なのは タイトル・著者・発行年 のみなので、発行日文字列からは年だけを取り出す。

const OPENBD_URL = 'https://api.openbd.jp/v1/get?isbn=';
const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes?q=isbn:';

function normalizeIsbn(raw) {
  let isbn = (raw || '').toUpperCase().replace(/[^0-9X]/g, '');
  if (isbn.length === 10) {
    isbn = isbn10to13(isbn);
  }
  return /^\d{13}$/.test(isbn) ? isbn : null;
}

function isbn10to13(isbn10) {
  const core = '978' + isbn10.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return core + String(check);
}

function extractYear(dateStr) {
  if (!dateStr) return null;
  const m = String(dateStr).match(/(\d{4})/);
  return m ? m[1] : null;
}

async function lookupIsbn(isbnRaw) {
  const isbn = normalizeIsbn(isbnRaw);
  if (!isbn) {
    throw new Error('ISBNの形式が正しくありません');
  }

  const book = { isbn, title: null, author: null, year: null, source: null };

  try {
    const res = await fetch(OPENBD_URL + encodeURIComponent(isbn));
    if (res.ok) {
      const data = await res.json();
      if (data && data[0]) {
        const summary = data[0].summary || {};
        book.title = summary.title || null;
        book.author = summary.author || null;
        book.year = extractYear(summary.pubdate);
        book.source = 'openbd';
      }
    }
  } catch (e) {
    // ネットワークエラー時はGoogle Booksのみで続行
  }

  if (!book.title) {
    try {
      const res = await fetch(GOOGLE_BOOKS_URL + encodeURIComponent(isbn));
      if (res.ok) {
        const data = await res.json();
        const info = data.items && data.items[0] && data.items[0].volumeInfo;
        if (info) {
          book.title = book.title || info.title || null;
          if (!book.author && info.authors) {
            book.author = info.authors.join(', ');
          }
          book.year = book.year || extractYear(info.publishedDate);
          book.source = book.source ? book.source + '+google_books' : 'google_books';
        }
      }
    } catch (e) {
      // 両方失敗した場合は手動入力にフォールバック
    }
  }

  book.found = !!book.title;
  return book;
}
