(() => {
  const el = (id) => document.getElementById(id);
  const state = { books: [], query: '', activeTag: null, sort: 'year' };

  async function init() {
    try {
      const res = await fetch('data/books.json', { cache: 'no-store' });
      state.books = await res.json();
    } catch (e) {
      state.books = [];
    }
    renderTagFilter();
    render();
    updateLastUpdated();
  }

  function allTags() {
    const set = new Set();
    state.books.forEach((b) => (b.tags || []).forEach((t) => set.add(t)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function renderTagFilter() {
    const container = el('tag-filter');
    container.innerHTML = '';
    allTags().forEach((tag) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tag-chip' + (state.activeTag === tag ? ' active' : '');
      chip.textContent = tag;
      chip.addEventListener('click', () => {
        state.activeTag = state.activeTag === tag ? null : tag;
        renderTagFilter();
        render();
      });
      container.appendChild(chip);
    });
  }

  function visibleBooks() {
    let list = state.books.slice();
    if (state.activeTag) {
      list = list.filter((b) => (b.tags || []).includes(state.activeTag));
    }
    if (state.query) {
      const q = state.query.toLowerCase();
      list = list.filter((b) =>
        [b.title, b.author, b.isbn, ...(b.tags || [])].some((v) => (v || '').toLowerCase().includes(q))
      );
    }
    if (state.sort === 'year') {
      list.sort((a, b) => (b.year || '').localeCompare(a.year || ''));
    } else {
      list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ja'));
    }
    return list;
  }

  function render() {
    const list = visibleBooks();
    el('book-count').textContent = `${list.length} 冊 / 全 ${state.books.length} 冊`;
    const container = el('book-list');
    container.innerHTML = '';
    el('empty-message').classList.toggle('hidden', list.length > 0);

    list.forEach((book) => {
      const item = document.createElement('div');
      item.className = 'book-item';

      const main = document.createElement('div');
      main.className = 'book-main';

      const title = document.createElement('div');
      title.className = 'book-title';
      title.textContent = book.title || '';
      main.appendChild(title);

      const metaParts = [];
      if (book.author) metaParts.push(book.author);
      if (book.year) metaParts.push(book.year);
      if (metaParts.length) {
        const meta = document.createElement('div');
        meta.className = 'book-meta';
        meta.textContent = metaParts.join(' ・ ');
        main.appendChild(meta);
      }

      if (book.isbn) {
        const isbnEl = document.createElement('div');
        isbnEl.className = 'book-isbn';
        isbnEl.textContent = 'ISBN: ' + book.isbn;
        main.appendChild(isbnEl);
      }

      item.appendChild(main);

      if ((book.tags || []).length) {
        const tagsEl = document.createElement('div');
        tagsEl.className = 'book-tags';
        book.tags.forEach((t) => {
          const badge = document.createElement('span');
          badge.className = 'tag-badge';
          badge.textContent = t;
          tagsEl.appendChild(badge);
        });
        item.appendChild(tagsEl);
      }

      container.appendChild(item);
    });
  }

  el('search-input').addEventListener('input', (e) => {
    state.query = e.target.value.trim();
    render();
  });

  function setSort(mode) {
    state.sort = mode;
    el('sort-title-btn').classList.toggle('active', mode === 'title');
    el('sort-year-btn').classList.toggle('active', mode === 'year');
    render();
  }
  el('sort-title-btn').addEventListener('click', () => setSort('title'));
  el('sort-year-btn').addEventListener('click', () => setSort('year'));

  function updateLastUpdated() {
    let latest = null;
    state.books.forEach((b) => {
      const t = b.updated_at || b.created_at;
      if (t && (!latest || t > latest)) latest = t;
    });
    el('last-updated').textContent = latest ? new Date(latest).toLocaleDateString('ja-JP') : '-';
  }

  init();
})();
