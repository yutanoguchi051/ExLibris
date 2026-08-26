(() => {
  const el = (id) => document.getElementById(id);
  const state = { books: [], query: '' };

  function parseTags(str) {
    return (str || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // ---------- 一覧 ----------
  async function loadBooks() {
    const res = await fetch('/api/books');
    state.books = await res.json();
    render();
  }

  function visibleBooks() {
    let list = state.books.slice();
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter((b) =>
        [b.title, b.author, b.isbn, ...(b.tags || [])].some((v) => (v || '').toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
    return list;
  }

  function render() {
    const list = visibleBooks();
    el('list-count').textContent = `${list.length} 冊 / 全 ${state.books.length} 冊`;
    const tbody = el('book-table-body');
    tbody.innerHTML = '';
    list.forEach((book) => {
      const tr = document.createElement('tr');
      [book.title, book.author, book.year, book.isbn].forEach((val) => {
        const td = document.createElement('td');
        td.textContent = val || '';
        tr.appendChild(td);
      });
      const tagsTd = document.createElement('td');
      (book.tags || []).forEach((t) => {
        const badge = document.createElement('span');
        badge.className = 'tag-badge';
        badge.textContent = t;
        tagsTd.appendChild(badge);
      });
      tr.appendChild(tagsTd);

      const actionTd = document.createElement('td');
      const editBtn = document.createElement('button');
      editBtn.textContent = '編集';
      editBtn.addEventListener('click', () => openDetail(book));
      actionTd.appendChild(editBtn);
      tr.appendChild(actionTd);

      tbody.appendChild(tr);
    });
  }

  el('search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    render();
  });
  el('reload-btn').addEventListener('click', loadBooks);

  // ---------- 登録: バーコード ----------
  el('isbn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const isbn = el('isbn-input').value.trim();
    if (isbn) doLookup(isbn);
  });

  async function doLookup(isbn) {
    const statusEl = el('lookup-status');
    statusEl.textContent = '書誌情報を検索しています…';
    statusEl.className = 'status';
    try {
      const data = await lookupIsbn(isbn);
      if (data.found) {
        statusEl.textContent = `書誌情報が見つかりました（取得元: ${data.source}）`;
        statusEl.className = 'status ok';
      } else {
        statusEl.textContent = '書誌情報が見つかりませんでした。内容を確認して登録するか、手入力してください。';
        statusEl.className = 'status error';
      }
      showForm(data);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.className = 'status error';
    }
  }

  el('manual-btn').addEventListener('click', () => {
    el('lookup-status').textContent = '';
    showForm({ isbn: '', title: '', author: '', year: '' });
  });

  function showForm(data) {
    el('field-isbn').value = data.isbn || '';
    el('field-title').value = data.title || '';
    el('field-author').value = data.author || '';
    el('field-year').value = data.year || '';
    el('field-tags').value = '';
    el('book-form').classList.remove('hidden');
    el('field-title').focus();
  }

  el('cancel-form-btn').addEventListener('click', () => {
    el('book-form').classList.add('hidden');
    el('lookup-status').textContent = '';
    el('isbn-input').value = '';
    el('isbn-input').focus();
  });

  el('book-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      isbn: el('field-isbn').value.trim(),
      title: el('field-title').value.trim(),
      author: el('field-author').value.trim(),
      year: el('field-year').value.trim(),
      tags: parseTags(el('field-tags').value),
    };
    const statusEl = el('lookup-status');
    try {
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        statusEl.textContent = data.error || '登録に失敗しました';
        statusEl.className = 'status error';
        return;
      }
      statusEl.textContent = `「${data.title}」を登録しました`;
      statusEl.className = 'status ok';
      el('book-form').classList.add('hidden');
      el('isbn-input').value = '';
      el('isbn-input').focus();
      loadBooks();
    } catch (err) {
      statusEl.textContent = '通信エラー: ' + err.message;
      statusEl.className = 'status error';
    }
  });

  // ---------- 編集モーダル ----------
  let currentId = null;

  function openDetail(book) {
    currentId = book.id;
    el('detail-isbn').value = book.isbn || '';
    el('detail-title').value = book.title || '';
    el('detail-author').value = book.author || '';
    el('detail-year').value = book.year || '';
    el('detail-tags').value = (book.tags || []).join(', ');
    el('detail-status').textContent = '';
    el('detail-modal').classList.remove('hidden');
  }

  el('detail-close-btn').addEventListener('click', () => {
    el('detail-modal').classList.add('hidden');
  });

  el('detail-save-btn').addEventListener('click', async () => {
    const statusEl = el('detail-status');
    const payload = {
      isbn: el('detail-isbn').value.trim(),
      title: el('detail-title').value.trim(),
      author: el('detail-author').value.trim(),
      year: el('detail-year').value.trim(),
      tags: parseTags(el('detail-tags').value),
    };
    try {
      const res = await fetch(`/api/books/${encodeURIComponent(currentId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        statusEl.textContent = data.error || '保存に失敗しました';
        statusEl.className = 'status error';
        return;
      }
      el('detail-modal').classList.add('hidden');
      loadBooks();
    } catch (err) {
      statusEl.textContent = '通信エラー: ' + err.message;
      statusEl.className = 'status error';
    }
  });

  el('detail-delete-btn').addEventListener('click', async () => {
    if (!confirm('この本を削除しますか？')) return;
    const res = await fetch(`/api/books/${encodeURIComponent(currentId)}`, { method: 'DELETE' });
    if (res.ok) {
      el('detail-modal').classList.add('hidden');
      loadBooks();
    } else {
      const data = await res.json();
      alert(data.error || '削除に失敗しました');
    }
  });

  // ---------- Gitへの反映 ----------
  el('publish-btn').addEventListener('click', async () => {
    const statusEl = el('publish-status');
    statusEl.textContent = 'commit & push しています…';
    statusEl.className = 'status publish-status';
    try {
      const res = await fetch('/api/publish', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        statusEl.textContent = '失敗しました: ' + (data.error || '不明なエラー');
        statusEl.className = 'status error publish-status';
        return;
      }
      statusEl.textContent = '反映しました\n' + (data.log || '');
      statusEl.className = 'status ok publish-status';
    } catch (err) {
      statusEl.textContent = '通信エラー: ' + err.message;
      statusEl.className = 'status error publish-status';
    }
  });

  // ---------- 初期化 ----------
  loadBooks();
})();
