const pdfjsLib = window.pdfjsLib;

const pdfInput = document.getElementById('pdf-input');
const documentList = document.getElementById('document-list');
const documentViewer = document.getElementById('document-viewer');
const dossierList = document.getElementById('dossier-list');
const dossierViewer = document.getElementById('dossier-viewer');
const newDossierForm = document.getElementById('new-dossier-form');
const newDossierName = document.getElementById('new-dossier-name');
const pageTemplate = document.getElementById('page-template');
const markerModal = document.getElementById('marker-modal');
const markerTextarea = document.getElementById('marker-text');
const markerCancelButton = document.getElementById('marker-cancel');
const markerSaveButton = document.getElementById('marker-save');

if (!pdfjsLib || !pdfjsLib.GlobalWorkerOptions) {
  console.error('No se ha podido cargar pdf.js');
  alert('No se pudo inicializar el visor de PDF. Revisa tu conexión e inténtalo de nuevo.');
  throw new Error('pdf.js no disponible');
}

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const state = {
  documents: new Map(),
  dossiers: new Map(),
  selectedDocumentId: null,
  selectedDossierId: null,
  markerTarget: null,
};

function uid(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function createCoverPage(name) {
  return {
    id: uid('cover'),
    type: 'cover',
    title: name,
  };
}

function createDossier(name) {
  const id = uid('dossier');
  const dossier = {
    id,
    name,
    pages: [createCoverPage(name)],
  };
  state.dossiers.set(id, dossier);
  return dossier;
}

function ensureInitialDossiers() {
  const defaults = ['Política', 'Deportes', 'Economía'];
  defaults.forEach((name) => createDossier(name));
}

function renderDocumentList() {
  documentList.innerHTML = '';
  if (!state.documents.size) {
    const empty = document.createElement('p');
    empty.className = 'placeholder';
    empty.textContent = 'Sube tus periódicos en PDF para comenzar a crear dossieres.';
    documentList.appendChild(empty);
    return;
  }

  for (const doc of state.documents.values()) {
    const button = document.createElement('button');
    button.className = 'document-item';
    button.dataset.id = doc.id;
    button.innerHTML = `<span class="document-item__name">${doc.name}</span><span>${doc.pageCount || ''}</span>`;
    if (doc.id === state.selectedDocumentId) {
      button.classList.add('active');
    }
    button.addEventListener('click', () => {
      state.selectedDocumentId = doc.id;
      renderDocumentList();
      renderDocumentPages(doc.id);
    });
    documentList.appendChild(button);
  }
}

async function renderDocumentPages(documentId) {
  const doc = state.documents.get(documentId);
  if (!doc) return;

  documentViewer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'page-grid';
  documentViewer.appendChild(grid);

  const pdf = await doc.pdfPromise;
  doc.pageCount = pdf.numPages;
  renderDocumentList();

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const card = createPageCard({
      title: `Página ${pageNumber}`,
      pageNumber,
      actions: [
        {
          label: 'Añadir al dossier',
          handler: () => addPageToDossier(doc.id, pageNumber),
        },
      ],
      footer: [`${doc.name}`],
    });

    const canvasWrapper = card.querySelector('.page-card__canvas-wrapper');
    const canvas = document.createElement('canvas');
    canvasWrapper.appendChild(canvas);
    await renderPdfPageToCanvas(page, canvas, 0.45);

    grid.appendChild(card);
  }
}

function createPageCard({ title, actions = [], footer = [] }) {
  const card = pageTemplate.content.firstElementChild.cloneNode(true);
  const titleEl = card.querySelector('.page-card__title');
  const actionsContainer = card.querySelector('.page-card__actions');
  const footerEl = card.querySelector('.page-card__footer');

  titleEl.textContent = title;
  actionsContainer.innerHTML = '';
  footerEl.innerHTML = '';

  actions.forEach(({ label, handler, disabled }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.addEventListener('click', handler);
    actionsContainer.appendChild(button);
  });

  footer.forEach((item) => {
    if (typeof item === 'string') {
      const span = document.createElement('span');
      span.textContent = item;
      footerEl.appendChild(span);
    } else if (item instanceof HTMLElement) {
      footerEl.appendChild(item);
    }
  });

  return card;
}

async function renderPdfPageToCanvas(page, canvas, scale = 0.35) {
  const viewport = page.getViewport({ scale });
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  await page.render({ canvasContext: context, viewport }).promise;
}

function renderDossierList() {
  dossierList.innerHTML = '';
  for (const dossier of state.dossiers.values()) {
    const button = document.createElement('button');
    button.className = 'dossier-item';
    button.dataset.id = dossier.id;
    button.innerHTML = `<span class="dossier-item__name">${dossier.name}</span><span>${dossier.pages.length - 1}</span>`;
    if (dossier.id === state.selectedDossierId) {
      button.classList.add('active');
    }
    button.addEventListener('click', () => {
      state.selectedDossierId = dossier.id;
      renderDossierList();
      renderDossier(dossier.id);
    });
    dossierList.appendChild(button);
  }
}

async function renderDossier(dossierId) {
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;

  dossierViewer.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'page-grid';
  grid.dataset.dossierId = dossierId;
  dossierViewer.appendChild(grid);

  for (const pageData of dossier.pages) {
    let card;

    if (pageData.type === 'cover') {
      card = createPageCard({
        title: 'Portada',
        actions: [],
        footer: [`${dossier.name}`],
      });
      card.classList.add('cover-card');
      card.draggable = false;
      const wrapper = card.querySelector('.page-card__canvas-wrapper');
      wrapper.innerHTML = '';
      const cover = document.createElement('div');
      cover.className = 'cover-page';
      cover.innerHTML = `<h3>${dossier.name.toUpperCase()}</h3><p>Dossier de prensa</p>`;
      wrapper.appendChild(cover);
    } else {
      const doc = state.documents.get(pageData.documentId);
      const actions = [
        {
          label: 'Eliminar',
          handler: () => removePageFromDossier(dossierId, pageData.id),
        },
        {
          label: 'Añadir marca',
          handler: () => openMarkerModal(dossierId, pageData.id),
        },
      ];

      card = createPageCard({
        title: `${doc ? doc.name : 'Periódico'} · Página ${pageData.pageNumber}`,
        actions,
        footer: buildMarkersFooter(pageData),
      });

      attachDragEvents(card, dossierId, pageData.id);

      const wrapper = card.querySelector('.page-card__canvas-wrapper');
      wrapper.innerHTML = '';

      if (doc) {
        const pdf = await doc.pdfPromise;
        const page = await pdf.getPage(pageData.pageNumber);
        const canvas = document.createElement('canvas');
        wrapper.appendChild(canvas);
        await renderPdfPageToCanvas(page, canvas, 0.45);
      } else {
        wrapper.innerHTML = '<p class="placeholder">Documento no disponible</p>';
      }
    }

    grid.appendChild(card);
  }

  grid.addEventListener('dragover', (event) => {
    event.preventDefault();
    const afterElement = getDragAfterElement(grid, event.clientY);
    const dragging = grid.querySelector('.dragging');
    if (!dragging) return;
    if (afterElement == null) {
      grid.appendChild(dragging);
    } else {
      grid.insertBefore(dragging, afterElement);
    }
  });

  grid.addEventListener('drop', () => {
    const order = Array.from(grid.children)
      .map((cardEl) => cardEl.dataset.pageId)
      .filter(Boolean);
    reorderDossierPages(dossierId, order);
  });
}

function buildMarkersFooter(pageData) {
  if (!pageData.markers || !pageData.markers.length) {
    return ['Sin marcas'];
  }
  const items = ['Marcas:'];
  pageData.markers.forEach((marker) => {
    const chip = document.createElement('span');
    chip.className = 'marker-chip';
    chip.textContent = marker.text;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = '×';
    removeButton.dataset.markerId = marker.id;
    chip.appendChild(removeButton);

    items.push(chip);
  });
  return items;
}

function attachDragEvents(card, dossierId, pageId) {
  card.dataset.pageId = pageId;
  card.addEventListener('dragstart', () => {
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.page-card[draggable="true"]:not(.dragging)')];

  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - (box.top + box.height / 2);
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

function addPageToDossier(documentId, pageNumber) {
  if (!state.selectedDossierId) {
    alert('Selecciona un dossier en el panel derecho antes de añadir páginas.');
    return;
  }

  const dossier = state.dossiers.get(state.selectedDossierId);
  if (!dossier) return;

  const pageData = {
    id: uid('page'),
    type: 'page',
    documentId,
    pageNumber,
    markers: [],
  };

  dossier.pages.push(pageData);
  renderDossier(state.selectedDossierId);
  renderDossierList();
}

function removePageFromDossier(dossierId, pageId) {
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;
  dossier.pages = dossier.pages.filter((page) => page.id !== pageId || page.type === 'cover');
  renderDossier(dossierId);
  renderDossierList();
}

function reorderDossierPages(dossierId, orderedIds) {
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;
  const cover = dossier.pages.find((page) => page.type === 'cover');
  const otherPages = dossier.pages.filter((page) => page.type !== 'cover');
  const idToPage = new Map(otherPages.map((page) => [page.id, page]));
  const reordered = orderedIds.map((id) => idToPage.get(id)).filter(Boolean);
  dossier.pages = [cover, ...reordered];
  renderDossier(dossierId);
  renderDossierList();
}

function openMarkerModal(dossierId, pageId) {
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;
  const page = dossier.pages.find((p) => p.id === pageId);
  if (!page) return;
  state.markerTarget = { dossierId, pageId };
  markerTextarea.value = '';
  markerModal.classList.remove('hidden');
  markerTextarea.focus();
}

function closeMarkerModal() {
  state.markerTarget = null;
  markerTextarea.value = '';
  markerModal.classList.add('hidden');
}

function saveMarker() {
  const text = markerTextarea.value.trim();
  if (!text || !state.markerTarget) {
    closeMarkerModal();
    return;
  }
  const { dossierId, pageId } = state.markerTarget;
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;
  const page = dossier.pages.find((p) => p.id === pageId);
  if (!page) return;
  page.markers.push({ id: uid('marker'), text });
  closeMarkerModal();
  renderDossier(dossierId);
}

function removeMarker(dossierId, pageId, markerId) {
  const dossier = state.dossiers.get(dossierId);
  if (!dossier) return;
  const page = dossier.pages.find((p) => p.id === pageId);
  if (!page) return;
  page.markers = page.markers.filter((marker) => marker.id !== markerId);
  renderDossier(dossierId);
}

function handleDocumentUpload(event) {
  const files = Array.from(event.target.files || []);
  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buffer = reader.result;
      const id = uid('doc');
      const pdfPromise = pdfjsLib.getDocument({ data: buffer }).promise;
      state.documents.set(id, {
        id,
        name: file.name.replace(/\.pdf$/i, ''),
        buffer,
        pdfPromise,
        pageCount: null,
      });
      renderDocumentList();
    };
    reader.readAsArrayBuffer(file);
  });

  event.target.value = '';
}

function handleNewDossier(event) {
  event.preventDefault();
  const name = newDossierName.value.trim();
  if (!name) return;
  const dossier = createDossier(name);
  state.selectedDossierId = dossier.id;
  newDossierName.value = '';
  renderDossierList();
  renderDossier(dossier.id);
}

function init() {
  ensureInitialDossiers();
  renderDocumentList();
  renderDossierList();

  pdfInput.addEventListener('change', handleDocumentUpload);
  newDossierForm.addEventListener('submit', handleNewDossier);
  markerCancelButton.addEventListener('click', closeMarkerModal);
  markerSaveButton.addEventListener('click', saveMarker);
  markerModal.addEventListener('click', (event) => {
    if (event.target === markerModal) {
      closeMarkerModal();
    }
  });

  dossierViewer.addEventListener('click', (event) => {
    const markerButton = event.target.closest('.marker-chip button');
    if (!markerButton) return;
    event.preventDefault();
    const card = event.target.closest('.page-card');
    if (!card) return;
    const pageId = card.dataset.pageId;
    const markerId = markerButton.dataset.markerId;
    if (!pageId || !markerId) return;
    removeMarker(state.selectedDossierId, pageId, markerId);
  });
}

init();
