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

// openBDの著者名はONIXの生データに近く、複数の寄与者がスペース区切りで連結され、
// それぞれが「姓,名」や「姓,名,生没年」の形式になっている。
// 「／著」のような役割表記は基本的に不要だが、翻訳書の「／訳」は訳者を示す重要な情報なので残す。
// 生没年は除去し、姓名を区切るカンマは詰めて連結し、複数著者は全角「，」で区切る。
function cleanAuthorName(raw) {
  if (!raw) return raw;
  const contributors = raw
    .split(/\s+/)
    .filter(Boolean)
    .map(cleanContributorToken);
  return contributors.join('，') || null;
}

function cleanContributorToken(token) {
  // 「／訳」（共訳なども含む）は残し、それ以外の「／著」等の役割表記は削除する
  let t = token.replace(/／([^\s、,]*)/g, (m, role) => (role.includes('訳') ? m : ''));
  t = t.replace(/,?\d{3,4}-(\d{3,4})?/g, ''); // 生没年（例: ,1984- や ,1922-2010）を除去
  t = t.replace(/,/g, ''); // 「姓,名」区切りのカンマを詰める（スペースは入れない）
  return t;
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
        book.author = cleanAuthorName(summary.author);
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
            book.author = info.authors.join('，');
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
