// Widget Grist - Form Builder Pro
// Copiez ce code dans l'onglet JavaScript d'un widget personnalisé Grist

/**
 * Grist Form Builder Pro Widget
 * Copyright 2026 Said Hamadou (isaytoo)
 * Licensed under the Apache License, Version 2.0
 * https://github.com/isaytoo/grist-form-builder-widget
 */

// Variables globales
let availableTables = [];
let currentTable = null;
let tableColumns = [];
let formFields = [];
let selectedField = null;
let draggedData = null;
let formConfig = null;
let templates = [];
let versionHistory = [];
let currentPage = 1;
let totalPages = 1;
let isOwner = false;
let userRole = null;
let canSubmit = true;
let currentUserEmail = null;
let snapToGrid = true;
let showGrid = true;
let zoomLevel = 100;
let fieldIdCounter = 0;

// Éléments DOM
const tableSelect = document.getElementById('table-select');
const fieldsList = document.getElementById('fields-list');
const formCanvas = document.getElementById('form-canvas');
const emptyMessage = document.getElementById('empty-message');
const propertiesContent = document.getElementById('properties-content');
const editorView = document.getElementById('editor-view');
const formView = document.getElementById('form-view');
const formFieldsView = document.getElementById('form-fields-view');
const formTitleInput = document.getElementById('form-title-input');
const toast = document.getElementById('toast');
const loading = document.getElementById('loading');
const modalTemplates = document.getElementById('modal-templates');
const templatesList = document.getElementById('templates-list');
const templateNameInput = document.getElementById('template-name');

// Boutons
const btnModeEdit = document.getElementById('btn-mode-edit');
const btnModeFill = document.getElementById('btn-mode-fill');
const btnSave = document.getElementById('btn-save');
const btnClear = document.getElementById('btn-clear');
const btnSubmit = document.getElementById('btn-submit');
const btnResetForm = document.getElementById('btn-reset-form');
const btnGrid = document.getElementById('btn-grid');
const btnSnap = document.getElementById('btn-snap');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomFit = document.getElementById('btn-zoom-fit');
const sidebarToggle = document.getElementById('sidebar-toggle');
const propertiesToggle = document.getElementById('properties-toggle');
const sidebar = document.getElementById('sidebar');
const propertiesPanel = document.getElementById('properties-panel');
const btnTemplates = document.getElementById('btn-templates');
const btnExportPdf = document.getElementById('btn-export-pdf');
const btnSaveTemplate = document.getElementById('btn-save-template');
const btnExportTemplate = document.getElementById('btn-export-template');
const btnImportTemplate = document.getElementById('btn-import-template');
const importFile = document.getElementById('import-file');
const btnCloseTemplates = document.getElementById('btn-close-templates');

// Tabs sidebar
const sidebarTabs = document.querySelectorAll('.sidebar-tab');
const tabPanels = document.querySelectorAll('.tab-panel');

// Éléments draggables
const elementItems = document.querySelectorAll('.element-item');

// Initialisation Grist
grist.ready({
  requiredAccess: 'full',
  allowSelectBy: true
});

// Détecter si l'utilisateur est propriétaire (peut modifier la structure)
async function detectUserRole() {
  // Récupérer l'email via getAccessToken + API REST Grist
  try {
    var tokenInfo = await grist.docApi.getAccessToken({readOnly: true});
    console.log('[FormBuilder] Token obtenu, baseUrl:', tokenInfo.baseUrl);

    if (tokenInfo && tokenInfo.baseUrl && tokenInfo.token) {
      // baseUrl = https://grist.gristup.fr/api/docs/{docId}
      // On veut https://grist.gristup.fr/api/session/access/active
      var baseUrl = tokenInfo.baseUrl;
      var apiRoot = baseUrl.replace(/\/api\/docs\/.*$/, '/api');
      console.log('[FormBuilder] API root:', apiRoot);

      // Essayer /api/session/access/active
      try {
        var resp = await fetch(apiRoot + '/session/access/active', {
          headers: { 'Authorization': 'Bearer ' + tokenInfo.token }
        });
        console.log('[FormBuilder] Session API status:', resp.status);
        if (resp.ok) {
          var sessionInfo = await resp.json();
          currentUserEmail = sessionInfo?.user?.email || null;
          console.log('[FormBuilder] Email via session:', currentUserEmail);
        } else {
          console.log('[FormBuilder] Session API réponse:', resp.status, resp.statusText);
        }
      } catch (e) {
        console.log('[FormBuilder] Session API erreur:', e.message);
      }

      // Fallback: essayer directement via le baseUrl du doc
      if (!currentUserEmail) {
        try {
          var resp2 = await fetch(baseUrl + '/tables/_grist_ACLPrincipals/records', {
            headers: { 'Authorization': 'Bearer ' + tokenInfo.token }
          });
          console.log('[FormBuilder] ACL API status:', resp2.status);
        } catch (e) {
          console.log('[FormBuilder] ACL API erreur:', e.message);
        }
      }
    }
  } catch (e) {
    console.log('[FormBuilder] getAccessToken erreur:', e.message);
  }

  console.log('[FormBuilder] Email final:', currentUserEmail || 'non détecté');

  // Vérifier le rôle via la table configurée
  await checkUserRole();
  applyRoleRestrictions();
}

// Vérifier le rôle de l'utilisateur via la table de rôles configurée
async function checkUserRole() {
  // Par défaut, tout le monde peut soumettre
  isOwner = true;
  canSubmit = true;
  userRole = null;

  if (!formConfig) return;

  const rolesTable = formConfig.rolesTable;
  const rolesEmailColumn = formConfig.rolesEmailColumn;
  const rolesRoleColumn = formConfig.rolesRoleColumn;
  const allowedRoles = formConfig.allowedRoles || [];

  // Si pas de config de rôles, tout le monde peut soumettre (comportement par défaut)
  if (!rolesTable || !rolesEmailColumn || !rolesRoleColumn || allowedRoles.length === 0) {
    return;
  }

  // Si on n'a pas l'email
  if (!currentUserEmail) {
    if (isFormMode) {
      // En mode formulaire partagé, bloquer si on ne peut pas vérifier l'identité
      console.log('[FormBuilder] Email non disponible en mode form, soumission bloquée');
      canSubmit = false;
    } else {
      console.log('[FormBuilder] Email non disponible, accès autorisé par défaut');
    }
    return;
  }

  try {
    const data = await grist.docApi.fetchTable(rolesTable);
    const emailCol = data[rolesEmailColumn];
    const roleCol = data[rolesRoleColumn];

    if (!emailCol || !roleCol) {
      console.log('[FormBuilder] Colonnes de rôles introuvables dans', rolesTable);
      if (isFormMode) canSubmit = false;
      return;
    }

    // Chercher l'utilisateur par email (insensible à la casse)
    const userIndex = emailCol.findIndex(function(email) {
      return email && email.toString().toLowerCase() === currentUserEmail.toLowerCase();
    });

    if (userIndex >= 0) {
      userRole = roleCol[userIndex];
      console.log('[FormBuilder] Rôle trouvé:', userRole);

      // Vérifier si le rôle est autorisé à soumettre
      canSubmit = allowedRoles.some(function(r) {
        return r.toLowerCase() === userRole.toString().toLowerCase();
      });

      // Seuls les OWNER Grist peuvent éditer la structure
      // Les autres sont en mode saisie uniquement
      isOwner = true; // L'édition de structure reste liée au mode Grist, pas au rôle
    } else {
      console.log('[FormBuilder] Utilisateur non trouvé dans', rolesTable, '- email:', currentUserEmail);
      // Utilisateur non trouvé dans la table des rôles → bloquer
      canSubmit = false;
    }
  } catch (e) {
    console.log('[FormBuilder] Erreur lecture table rôles:', e.message);
    // En mode form, bloquer par sécurité. Sinon, ne pas bloquer.
    canSubmit = !isFormMode;
  }
}

// Appliquer les restrictions selon le rôle
function applyRoleRestrictions() {
  if (!isOwner) {
    // Masquer les éléments d'édition pour les non-propriétaires
    btnModeEdit.style.display = 'none';
    document.querySelector('.sidebar')?.classList.add('hidden');
    document.querySelector('.properties-panel')?.classList.add('hidden');
    btnSave.style.display = 'none';
    btnClear.style.display = 'none';
    btnTemplates.style.display = 'none';
    
    // Masquer aussi Partager, Guide et PDF en mode formulaire
    document.getElementById('btn-share-form').style.display = 'none';
    document.getElementById('btn-mode-guide').style.display = 'none';
    document.getElementById('btn-export-pdf').style.display = 'none';
    
    // Forcer le mode Saisie
    switchMode('fill');
  }

  // Bloquer le bouton Enregistrer si l'utilisateur n'a pas le droit de soumettre
  if (!canSubmit && btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.style.opacity = '0.5';
    btnSubmit.style.cursor = 'not-allowed';
    btnSubmit.title = 'Vous n\'avez pas la permission de soumettre ce formulaire';
    // Ajouter un message visible
    const submitParent = btnSubmit.parentElement;
    if (submitParent && !document.getElementById('no-submit-msg')) {
      const msg = document.createElement('p');
      msg.id = 'no-submit-msg';
      msg.style.cssText = 'color: #ef4444; font-size: 0.85em; margin-top: 8px; text-align: center;';
      msg.textContent = '🔒 Vous n\'avez pas la permission de soumettre ce formulaire' + (userRole ? ' (rôle: ' + userRole + ')' : '');
      submitParent.appendChild(msg);
    }
  }
}

// Flag pour éviter les appels multiples
let isInitialized = false;

// Vérifier si on est en mode formulaire public (paramètre URL ?mode=form)
const urlParams = new URLSearchParams(window.location.search);
const isFormMode = urlParams.get('mode') === 'form';
const targetTable = urlParams.get('table'); // Table cible pour le formulaire

// Charger les données au démarrage
grist.onOptions(async function(options) {
  if (isInitialized) return;
  isInitialized = true;
  
  formConfig = options || {};
  
  try {
    await loadTables();
  } catch (e) {
    console.error('Erreur loadTables:', e);
    // Si erreur d'accès, afficher un message
    if (e.message && e.message.includes('Access not granted')) {
      hideLoading();
      showToast('Veuillez accorder l\'accès complet au widget dans les paramètres Grist', 'error');
      return;
    }
  }
  
  // Toujours essayer de charger depuis la table BM_FormConfig (source de vérité)
  try {
    const tables = await grist.docApi.listTables();
    if (tables.includes('BM_FormConfig')) {
      const data = await grist.docApi.fetchTable('BM_FormConfig');
      if (data.ConfigData && data.ConfigData.length > 0) {
        // Si une table cible est spécifiée, chercher sa config
        if (targetTable) {
          const configKey = 'form_' + targetTable;
          const index = data.ConfigKey?.findIndex(k => k === configKey);
          if (index !== undefined && index >= 0) {
            formConfig = JSON.parse(data.ConfigData[index]);
          }
        } else {
          // Sinon, charger la config la plus récente ou celle des options
          const optionsTableId = formConfig.tableId;
          if (optionsTableId) {
            const configKey = 'form_' + optionsTableId;
            const index = data.ConfigKey?.findIndex(k => k === configKey);
            if (index !== undefined && index >= 0) {
              formConfig = JSON.parse(data.ConfigData[index]);
            }
          } else {
            // Charger la dernière config disponible
            formConfig = JSON.parse(data.ConfigData[data.ConfigData.length - 1]);
          }
        }
      }
    }
  } catch (e) {
    console.log('Pas de config trouvée dans la table BM_FormConfig');
  }
  
  // Fallback sur les options du widget si pas de config dans la table
  if ((!formConfig.fields || formConfig.fields.length === 0) && options && options.fields) {
    formConfig = options;
  }
  
  templates = formConfig.templates || [];
  totalPages = formConfig.totalPages || 1;
  versionHistory = formConfig.versionHistory || [];
  currentPage = 1;
  
  updatePageIndicator();
  
  if (formConfig.title) {
    formTitleInput.value = formConfig.title;
  }
  
  if (formConfig.fields && formConfig.fields.length > 0) {
    formFields = formConfig.fields;
    fieldIdCounter = Math.max(...formFields.map(f => parseInt(f.id.replace('field_', '')) || 0)) + 1;
    if (formConfig.tableId) {
      tableSelect.value = formConfig.tableId;
      currentTable = formConfig.tableId;
      await loadTableColumns(formConfig.tableId);
    }
    renderFormFields();
  }
  
  // Détecter le rôle de l'utilisateur (vérification des droits de soumission)
  await detectUserRole();
  
  hideLoading();
  
  // Si mode formulaire public, forcer le mode saisie et masquer l'édition
  if (isFormMode) {
    isOwner = false;
    applyRoleRestrictions();
  }
});

// Charger la liste des tables
async function loadTables() {
  try {
    const tables = await grist.docApi.listTables();
    availableTables = tables;
    
    tableSelect.innerHTML = '<option value="">-- Sélectionner une table --</option>';
    tables.forEach(table => {
      const option = document.createElement('option');
      option.value = table;
      option.textContent = table;
      tableSelect.appendChild(option);
    });
    
    if (formConfig && formConfig.tableId) {
      tableSelect.value = formConfig.tableId;
    }
  } catch (error) {
    console.error('Erreur chargement tables:', error);
    showToast('Erreur lors du chargement des tables', 'error');
  }
}

// Charger les données pour un champ Lookup
async function loadLookupData(field) {
  if (!field.lookupTable) return;
  
  try {
    const data = await grist.docApi.fetchTable(field.lookupTable);
    field.lookupData = data;
  } catch (error) {
    console.error('Erreur chargement lookup:', error);
  }
}

// Charger les colonnes d'une table
async function loadTableColumns(tableId) {
  if (!tableId) {
    fieldsList.innerHTML = '<p style="color: #94a3b8; font-size: 0.85em; padding: 10px;">Sélectionnez une table</p>';
    return;
  }
  
  try {
    currentTable = tableId;
    const columns = await grist.docApi.fetchTable(tableId);
    
    const columnNames = Object.keys(columns).filter(col => 
      col !== 'id' && 
      !col.startsWith('grist') && 
      col !== 'manualSort'
    );
    tableColumns = columnNames.map(name => ({
      id: name,
      name: name,
      type: guessFieldType(columns[name])
    }));
    
    renderFieldsList();
  } catch (error) {
    console.error('Erreur chargement colonnes:', error);
    showToast('Erreur lors du chargement des colonnes', 'error');
  }
}

// Deviner le type de champ
function guessFieldType(values) {
  if (!values || values.length === 0) return 'text';
  const sample = values.find(v => v !== null && v !== undefined && v !== '');
  if (sample === undefined) return 'text';
  if (typeof sample === 'number') return 'number';
  if (typeof sample === 'boolean') return 'checkbox';
  if (typeof sample === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(sample)) return 'date';
  }
  return 'text';
}

// Icônes par type
function getFieldIcon(type) {
  const icons = {
    'text': '📝', 'textarea': '📄', 'number': '🔢', 'date': '📅',
    'email': '📧', 'phone': '📞', 'select': '📋', 'radio': '🔘',
    'checkbox': '☑️', 'signature': '✍️', 'section': '📦'
  };
  return icons[type] || '📝';
}

// Afficher la liste des champs
function renderFieldsList() {
  fieldsList.innerHTML = '';
  
  if (tableColumns.length === 0) {
    fieldsList.innerHTML = '<p style="color: #94a3b8; font-size: 0.85em; padding: 10px;">Aucun champ disponible</p>';
    return;
  }
  
  tableColumns.forEach(col => {
    const fieldItem = document.createElement('div');
    fieldItem.className = 'field-item';
    fieldItem.draggable = true;
    fieldItem.dataset.fieldId = col.id;
    fieldItem.dataset.fieldName = col.name;
    fieldItem.dataset.fieldType = col.type;
    fieldItem.dataset.isColumn = 'true';
    
    fieldItem.innerHTML = `
      <span class="field-icon">${getFieldIcon(col.type)}</span>
      <span class="field-name">${col.name}</span>
      <span class="field-type">${col.type}</span>
    `;
    
    fieldItem.addEventListener('dragstart', handleDragStart);
    fieldItem.addEventListener('dragend', handleDragEnd);
    
    fieldsList.appendChild(fieldItem);
  });
}

// Gestion du drag & drop
function handleDragStart(e) {
  const isColumn = e.target.dataset.isColumn === 'true';
  const elementType = e.target.dataset.elementType;
  
  if (isColumn) {
    draggedData = {
      type: 'column',
      columnId: e.target.dataset.fieldId,
      columnName: e.target.dataset.fieldName,
      fieldType: e.target.dataset.fieldType
    };
  } else if (elementType) {
    draggedData = {
      type: 'element',
      elementType: elementType
    };
  }
  
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedData = null;
}

// Événements éléments
elementItems.forEach(item => {
  item.addEventListener('dragstart', handleDragStart);
  item.addEventListener('dragend', handleDragEnd);
});

// Événements canvas
formCanvas.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  formCanvas.classList.add('drag-over');
});

formCanvas.addEventListener('dragleave', () => {
  formCanvas.classList.remove('drag-over');
});

formCanvas.addEventListener('drop', (e) => {
  e.preventDefault();
  formCanvas.classList.remove('drag-over');
  
  if (!draggedData) return;
  
  const rect = formCanvas.getBoundingClientRect();
  let x = e.clientX - rect.left - 100;
  let y = e.clientY - rect.top - 20;
  
  // Snap to grid
  if (snapToGrid) {
    x = Math.round(x / 20) * 20;
    y = Math.round(y / 20) * 20;
  }
  
  x = Math.max(0, x);
  y = Math.max(0, y);
  
  let newField;
  
  if (draggedData.type === 'column') {
    // Vérifier si la colonne existe déjà
    const existing = formFields.find(f => f.columnId === draggedData.columnId);
    if (existing) {
      showToast('Ce champ est déjà sur le formulaire', 'error');
      return;
    }
    
    newField = {
      id: 'field_' + (fieldIdCounter++),
      columnId: draggedData.columnId,
      fieldType: draggedData.fieldType,
      label: draggedData.columnName,
      x: x,
      y: y,
      width: 250,
      page: currentPage,
      required: false,
      placeholder: '',
      options: [],
      validation: {},
      condition: null
    };
  } else if (draggedData.type === 'element') {
    newField = {
      id: 'field_' + (fieldIdCounter++),
      columnId: null,
      fieldType: draggedData.elementType,
      label: getDefaultLabel(draggedData.elementType),
      x: x,
      y: y,
      width: ['section', 'image'].includes(draggedData.elementType) ? 200 : (draggedData.elementType === 'title' ? 300 : 250),
      height: draggedData.elementType === 'section' ? 150 : (draggedData.elementType === 'image' ? 100 : null),
      page: currentPage,
      imageData: null,
      fontSize: draggedData.elementType === 'title' ? 14 : null,
      required: false,
      placeholder: '',
      options: draggedData.elementType === 'select' || draggedData.elementType === 'radio' || draggedData.elementType === 'checkbox' 
        ? ['Option 1', 'Option 2', 'Option 3'] : [],
      validation: {},
      condition: null
    };
  }
  
  formFields.push(newField);
  saveVersion('Ajout de champ');
  renderFormFields();
  selectField(newField.id);
  showToast('Champ ajouté', 'success');
});

function getDefaultLabel(type) {
  const labels = {
    'text': 'Texte', 'textarea': 'Description', 'number': 'Nombre',
    'date': 'Date', 'email': 'Email', 'phone': 'Téléphone',
    'image': 'Image', 'title': 'Titre', 'qrcode': 'QR Code', 'lookup': 'Recherche', 'calculated': 'Calcul',
    'select': 'Sélection', 'radio': 'Choix', 'checkbox': 'Options',
    'signature': 'Signature', 'section': 'Section', 'divider': 'Filet'
  };
  return labels[type] || 'Champ';
}

// Afficher les champs sur le formulaire
function renderFormFields() {
  const existingFields = formCanvas.querySelectorAll('.form-field, .form-section, .form-image, .form-title-element, .form-qrcode, .form-divider');
  existingFields.forEach(f => f.remove());
  
  // Filtrer les champs de la page courante
  const pageFields = formFields.filter(f => (f.page || 1) === currentPage);
  
  emptyMessage.style.display = pageFields.length === 0 ? 'block' : 'none';
  
  pageFields.forEach(field => {
    if (field.fieldType === 'section') {
      const sectionEl = createSectionElement(field);
      formCanvas.appendChild(sectionEl);
    } else if (field.fieldType === 'image') {
      const imageEl = createImageElement(field);
      formCanvas.appendChild(imageEl);
    } else if (field.fieldType === 'title') {
      const titleEl = createTitleElement(field);
      formCanvas.appendChild(titleEl);
    } else if (field.fieldType === 'qrcode') {
      const qrcodeEl = createQRCodeElement(field);
      formCanvas.appendChild(qrcodeEl);
    } else if (field.fieldType === 'divider') {
      const dividerEl = createDividerElement(field);
      formCanvas.appendChild(dividerEl);
    } else {
      const fieldEl = createFormFieldElement(field);
      formCanvas.appendChild(fieldEl);
    }
  });
}

// Créer un élément image
function createImageElement(field) {
  const imageEl = document.createElement('div');
  imageEl.className = 'form-image';
  imageEl.dataset.fieldId = field.id;
  imageEl.style.left = field.x + 'px';
  imageEl.style.top = field.y + 'px';
  imageEl.style.width = field.width + 'px';
  imageEl.style.height = (field.height || 100) + 'px';
  
  // Appliquer la couleur de fond
  if (field.transparent) {
    imageEl.style.backgroundColor = 'transparent';
    imageEl.style.border = '1px dashed #cbd5e1';
  } else if (field.bgColor) {
    imageEl.style.backgroundColor = field.bgColor;
  }
  
  if (field.imageData) {
    imageEl.innerHTML = `
      <button class="form-image-delete" title="Supprimer">×</button>
      <img src="${field.imageData}" alt="${field.label}" draggable="false">
      <div class="form-field-resize"></div>
    `;
  } else {
    imageEl.innerHTML = `
      <button class="form-image-delete" title="Supprimer">×</button>
      <div class="form-image-placeholder">🖼️</div>
      <div class="form-field-resize"></div>
    `;
  }
  
  imageEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-image-delete')) return;
    if (e.target.classList.contains('form-field-resize')) return;
    e.preventDefault();
    selectField(field.id);
    startDragField(e, imageEl, field);
  });
  
  imageEl.querySelector('.form-image-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  // Redimensionnement
  const resizeHandle = imageEl.querySelector('.form-field-resize');
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startResizeImage(e, imageEl, field);
  });
  
  return imageEl;
}

// Redimensionner une image (largeur + hauteur)
function startResizeImage(e, imageEl, field) {
  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = field.width;
  const startHeight = field.height || 100;
  
  function onMouseMove(e) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    let newWidth = startWidth + dx;
    let newHeight = startHeight + dy;
    
    if (snapToGrid) {
      newWidth = Math.round(newWidth / 20) * 20;
      newHeight = Math.round(newHeight / 20) * 20;
    }
    
    field.width = Math.max(50, newWidth);
    field.height = Math.max(50, newHeight);
    imageEl.style.width = field.width + 'px';
    imageEl.style.height = field.height + 'px';
  }
  
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Créer un élément titre/texte
function createTitleElement(field) {
  const titleEl = document.createElement('div');
  titleEl.className = 'form-title-element';
  titleEl.dataset.fieldId = field.id;
  titleEl.style.left = field.x + 'px';
  titleEl.style.top = field.y + 'px';
  titleEl.style.width = field.width + 'px';
  titleEl.style.fontSize = (field.fontSize || 14) + 'pt';
  if (field.fontFamily) titleEl.style.fontFamily = field.fontFamily;
  if (field.fontWeight) titleEl.style.fontWeight = field.fontWeight;
  if (field.fontStyle) titleEl.style.fontStyle = field.fontStyle;
  if (field.textDecoration) titleEl.style.textDecoration = field.textDecoration;
  if (field.textAlign) titleEl.style.textAlign = field.textAlign;
  if (field.lineHeight) titleEl.style.lineHeight = field.lineHeight;
  if (field.textColor) titleEl.style.color = field.textColor;
  if (field.transparent) {
    titleEl.style.backgroundColor = 'transparent';
  } else if (field.bgColor) {
    titleEl.style.backgroundColor = field.bgColor;
    titleEl.style.padding = '8px 12px';
    titleEl.style.borderRadius = '6px';
  }
  
  titleEl.innerHTML = `
    <button class="form-title-element-delete" title="Supprimer">×</button>
    <span contenteditable="true" spellcheck="false">${field.label}</span>
    <div class="resize-handle" title="Redimensionner"></div>
  `;
  
  const textSpan = titleEl.querySelector('span');
  
  titleEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-title-element-delete')) return;
    if (e.target.classList.contains('resize-handle')) return;
    if (e.target === textSpan && titleEl.classList.contains('selected')) return; // Allow text editing when selected
    selectField(field.id);
    if (e.target !== textSpan) {
      startDragField(e, titleEl, field);
    }
  });
  
  // Double-click to edit text
  titleEl.addEventListener('dblclick', (e) => {
    if (e.target === textSpan || e.target.closest('span[contenteditable]')) {
      textSpan.focus();
      // Select all text
      const range = document.createRange();
      range.selectNodeContents(textSpan);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
  
  // Save text on blur
  textSpan.addEventListener('blur', () => {
    field.label = textSpan.textContent || 'Texte';
    // Update properties panel if this field is selected
    if (selectedField && selectedField.id === field.id) {
      const labelInput = document.getElementById('prop-label');
      if (labelInput) labelInput.value = field.label;
    }
  });
  
  // Prevent Enter from creating new lines, save instead
  textSpan.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      textSpan.blur();
    }
    if (e.key === 'Escape') {
      textSpan.textContent = field.label;
      textSpan.blur();
    }
  });
  
  titleEl.querySelector('.form-title-element-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  // Resize handle
  titleEl.querySelector('.resize-handle').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    selectField(field.id);
    startResizeField(e, titleEl, field);
  });
  
  return titleEl;
}

// Créer un élément filet (ligne horizontale)
function createDividerElement(field) {
  const dividerEl = document.createElement('div');
  dividerEl.className = 'form-divider';
  dividerEl.dataset.fieldId = field.id;
  dividerEl.style.left = field.x + 'px';
  dividerEl.style.top = field.y + 'px';
  dividerEl.style.width = field.width + 'px';
  
  const lineStyle = `
    height: ${field.dividerHeight || 2}px;
    background: ${field.dividerColor || '#cbd5e1'};
    ${field.dividerStyle === 'dashed' ? 'border-top: ' + (field.dividerHeight || 2) + 'px dashed ' + (field.dividerColor || '#cbd5e1') + '; background: transparent;' : ''}
    ${field.dividerStyle === 'dotted' ? 'border-top: ' + (field.dividerHeight || 2) + 'px dotted ' + (field.dividerColor || '#cbd5e1') + '; background: transparent;' : ''}
  `;
  
  dividerEl.innerHTML = `
    <button class="form-divider-delete" title="Supprimer">×</button>
    <div class="form-divider-line" style="${lineStyle}"></div>
    <div class="resize-handle" title="Redimensionner"></div>
  `;
  
  dividerEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-divider-delete')) return;
    if (e.target.classList.contains('resize-handle')) return;
    selectField(field.id);
    startDragField(e, dividerEl, field);
  });
  
  dividerEl.querySelector('.form-divider-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  dividerEl.querySelector('.resize-handle').addEventListener('mousedown', (e) => {
    e.stopPropagation();
    selectField(field.id);
    startResizeField(e, dividerEl, field);
  });
  
  return dividerEl;
}

// Créer un élément QR Code
function createQRCodeElement(field) {
  const qrcodeEl = document.createElement('div');
  qrcodeEl.className = 'form-qrcode';
  qrcodeEl.dataset.fieldId = field.id;
  qrcodeEl.style.left = field.x + 'px';
  qrcodeEl.style.top = field.y + 'px';
  
  // Appliquer la couleur de fond
  if (field.transparent) {
    qrcodeEl.style.backgroundColor = 'transparent';
    qrcodeEl.style.border = '1px dashed #cbd5e1';
  } else if (field.bgColor) {
    qrcodeEl.style.backgroundColor = field.bgColor;
  }
  
  const size = field.qrSize || 100;
  const qrContent = field.qrContent || 'https://gristup.fr';
  
  qrcodeEl.innerHTML = `
    <button class="form-qrcode-delete" title="Supprimer">×</button>
    <div class="qrcode-container" id="qr-${field.id}"></div>
  `;
  
  // Générer le QR Code après l'ajout au DOM
  setTimeout(() => {
    const container = document.getElementById('qr-' + field.id);
    if (container && typeof QRCode !== 'undefined') {
      container.innerHTML = '';
      new QRCode(container, {
        text: qrContent,
        width: size,
        height: size,
        colorDark: field.qrColor || '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    }
  }, 50);
  
  qrcodeEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-qrcode-delete')) return;
    selectField(field.id);
    startDragField(e, qrcodeEl, field);
  });
  
  qrcodeEl.querySelector('.form-qrcode-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  return qrcodeEl;
}

// Créer un élément de champ
function createFormFieldElement(field) {
  const fieldEl = document.createElement('div');
  fieldEl.className = 'form-field';
  fieldEl.dataset.fieldId = field.id;
  fieldEl.style.left = field.x + 'px';
  fieldEl.style.top = field.y + 'px';
  fieldEl.style.width = field.width + 'px';
  
  // Appliquer la couleur de fond
  if (field.transparent) {
    fieldEl.style.backgroundColor = 'transparent';
    fieldEl.style.border = '1px dashed #cbd5e1';
  } else if (field.bgColor) {
    fieldEl.style.backgroundColor = field.bgColor;
  }
  
  let inputHtml = '';
  
  switch (field.fieldType) {
    case 'textarea':
      inputHtml = `<textarea class="form-field-input form-field-textarea" placeholder="${field.placeholder || 'Saisir...'}" readonly></textarea>`;
      break;
    case 'select':
      inputHtml = `<select class="form-field-input" disabled>
        <option>${field.placeholder || 'Sélectionner...'}</option>
        ${field.options.map(o => `<option>${o}</option>`).join('')}
      </select>`;
      break;
    case 'radio':
    case 'checkbox':
      inputHtml = `<div class="options-preview">
        ${field.options.slice(0, 3).map(o => `
          <label class="option-item">
            <input type="${field.fieldType === 'radio' ? 'radio' : 'checkbox'}" disabled>
            <span>${o}</span>
          </label>
        `).join('')}
        ${field.options.length > 3 ? '<span style="font-size: 0.75em; color: #94a3b8;">...</span>' : ''}
      </div>`;
      break;
    case 'signature':
      inputHtml = `<div class="signature-pad">✍️ Zone de signature</div>`;
      break;
    case 'date':
      inputHtml = `<input type="date" class="form-field-input" disabled>`;
      break;
    default:
      inputHtml = `<input type="${field.fieldType === 'email' ? 'email' : field.fieldType === 'phone' ? 'tel' : 'text'}" class="form-field-input" placeholder="${field.placeholder || 'Saisir...'}" readonly>`;
  }
  
  // Appliquer le style selon la position du label et si le label est masqué
  if (field.hideLabel) {
    // Label masqué - afficher uniquement le champ
    fieldEl.innerHTML = `
      <button class="form-field-delete" title="Supprimer">×</button>
      ${inputHtml}
      <div class="form-field-resize"></div>
    `;
  } else if (field.labelPosition === 'left') {
    fieldEl.innerHTML = `
      <button class="form-field-delete" title="Supprimer">×</button>
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="form-field-label" style="flex-shrink: 0; margin-bottom: 0; min-width: 80px; max-width: 40%;">${field.label}${field.required ? ' <span style="color: #ef4444;">*</span>' : ''}</div>
        <div style="flex: 1;">${inputHtml}</div>
      </div>
      <div class="form-field-resize"></div>
    `;
  } else {
    fieldEl.innerHTML = `
      <button class="form-field-delete" title="Supprimer">×</button>
      <div class="form-field-label">${field.label}${field.required ? ' <span style="color: #ef4444;">*</span>' : ''}</div>
      ${inputHtml}
      <div class="form-field-resize"></div>
    `;
  }
  
  // Événements
  fieldEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-field-delete')) return;
    if (e.target.classList.contains('form-field-resize')) return;
    selectField(field.id);
    startDragField(e, fieldEl, field);
  });
  
  fieldEl.querySelector('.form-field-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  const resizeHandle = fieldEl.querySelector('.form-field-resize');
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startResizeField(e, fieldEl, field);
  });
  
  return fieldEl;
}

// Créer une section
function createSectionElement(field) {
  const sectionEl = document.createElement('div');
  sectionEl.className = 'form-section';
  sectionEl.dataset.fieldId = field.id;
  sectionEl.style.left = field.x + 'px';
  sectionEl.style.top = field.y + 'px';
  sectionEl.style.width = field.width + 'px';
  sectionEl.style.height = (field.height || 150) + 'px';
  if (field.transparent) {
    sectionEl.style.backgroundColor = 'transparent';
    sectionEl.style.border = '1px dashed #cbd5e1';
  } else if (field.bgColor) {
    sectionEl.style.backgroundColor = field.bgColor;
  }
  
  sectionEl.innerHTML = `
    <button class="form-section-delete" title="Supprimer">×</button>
    <div class="form-section-title" style="${field.textColor ? 'color:' + field.textColor : ''}">${field.label}</div>
    <div class="form-field-resize"></div>
  `;
  
  sectionEl.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('form-section-delete')) return;
    if (e.target.classList.contains('form-field-resize')) return;
    selectField(field.id);
    startDragField(e, sectionEl, field);
  });
  
  sectionEl.querySelector('.form-section-delete').addEventListener('click', () => {
    deleteField(field.id);
  });
  
  // Redimensionnement
  const resizeHandle = sectionEl.querySelector('.form-field-resize');
  resizeHandle.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    startResizeImage(e, sectionEl, field);
  });
  
  return sectionEl;
}

// Trouver les éléments contenus dans une section
function getFieldsInSection(section) {
  const sectionLeft = section.x;
  const sectionTop = section.y;
  const sectionRight = section.x + section.width;
  const sectionBottom = section.y + (section.height || 150);
  
  return formFields.filter(f => {
    if (f.id === section.id) return false;
    if (f.fieldType === 'section') return false;
    
    // Vérifier si le centre du champ est dans la section
    const fieldCenterX = f.x + (f.width / 2);
    const fieldCenterY = f.y + 40; // Approximation du centre vertical
    
    return fieldCenterX >= sectionLeft && 
           fieldCenterX <= sectionRight && 
           fieldCenterY >= sectionTop && 
           fieldCenterY <= sectionBottom;
  });
}

// Déplacer un champ
function startDragField(e, fieldEl, field) {
  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = field.x;
  const startTop = field.y;
  
  // Si c'est une section, récupérer les éléments à l'intérieur
  let childFields = [];
  let childStartPositions = [];
  if (field.fieldType === 'section') {
    childFields = getFieldsInSection(field);
    childStartPositions = childFields.map(f => ({ id: f.id, x: f.x, y: f.y }));
  }
  
  function onMouseMove(e) {
    let dx = e.clientX - startX;
    let dy = e.clientY - startY;
    
    let newX = startLeft + dx;
    let newY = startTop + dy;
    
    if (snapToGrid) {
      newX = Math.round(newX / 20) * 20;
      newY = Math.round(newY / 20) * 20;
    }
    
    const actualDx = newX - startLeft;
    const actualDy = newY - startTop;
    
    field.x = Math.max(0, newX);
    field.y = Math.max(0, newY);
    
    fieldEl.style.left = field.x + 'px';
    fieldEl.style.top = field.y + 'px';
    
    // Déplacer aussi les éléments enfants
    if (field.fieldType === 'section') {
      childStartPositions.forEach(pos => {
        const childField = formFields.find(f => f.id === pos.id);
        if (childField) {
          childField.x = Math.max(0, pos.x + actualDx);
          childField.y = Math.max(0, pos.y + actualDy);
          const childEl = formCanvas.querySelector(`[data-field-id="${pos.id}"]`);
          if (childEl) {
            childEl.style.left = childField.x + 'px';
            childEl.style.top = childField.y + 'px';
          }
        }
      });
    }
  }
  
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Redimensionner un champ
function startResizeField(e, fieldEl, field) {
  const startX = e.clientX;
  const startWidth = field.width;
  
  function onMouseMove(e) {
    const dx = e.clientX - startX;
    let newWidth = startWidth + dx;
    
    if (snapToGrid) {
      newWidth = Math.round(newWidth / 20) * 20;
    }
    
    field.width = Math.max(150, newWidth);
    fieldEl.style.width = field.width + 'px';
  }
  
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }
  
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Sélectionner un champ
function selectField(fieldId) {
  const oldSelected = formCanvas.querySelector('.form-field.selected, .form-section.selected, .form-image.selected, .form-title-element.selected, .form-qrcode.selected, .form-divider.selected');
  if (oldSelected) oldSelected.classList.remove('selected');
  
  const fieldEl = formCanvas.querySelector(`[data-field-id="${fieldId}"]`);
  if (fieldEl) fieldEl.classList.add('selected');
  
  selectedField = formFields.find(f => f.id === fieldId);
  renderPropertiesPanel();
}

// Mettre au premier plan
function bringToFront(fieldId) {
  const index = formFields.findIndex(f => f.id === fieldId);
  if (index === -1 || index === formFields.length - 1) return;
  
  const field = formFields.splice(index, 1)[0];
  formFields.push(field);
  renderFormFields();
  selectField(fieldId);
  showToast('Mis au premier plan', 'success');
}

// Mettre en arrière-plan
function sendToBack(fieldId) {
  const index = formFields.findIndex(f => f.id === fieldId);
  if (index === -1 || index === 0) return;
  
  const field = formFields.splice(index, 1)[0];
  formFields.unshift(field);
  renderFormFields();
  selectField(fieldId);
  showToast('Mis en arrière-plan', 'success');
}

// Supprimer un champ
function deleteField(fieldId) {
  saveVersion('Suppression de champ');
  formFields = formFields.filter(f => f.id !== fieldId);
  selectedField = null;
  renderFormFields();
  renderPropertiesPanel();
  showToast('Champ supprimé', 'success');
}

// Panneau de propriétés
function renderPropertiesPanel() {
  if (!selectedField) {
    propertiesContent.innerHTML = '<p style="color: #94a3b8; font-size: 0.85em;">Sélectionnez un champ pour modifier ses propriétés</p>';
    return;
  }
  
  const f = selectedField;
  const isSection = f.fieldType === 'section';
  const isImage = f.fieldType === 'image';
  const isTitle = f.fieldType === 'title';
  const isQRCode = f.fieldType === 'qrcode';
  const isDivider = f.fieldType === 'divider';
  const hasOptions = ['select', 'radio', 'checkbox'].includes(f.fieldType);
  const isDecorative = isSection || isImage || isTitle || isQRCode || isDivider;
  
  let html = `
    <div class="property-group">
      <div class="property-label">${isTitle ? 'Texte' : 'Libellé'}</div>
      <input type="text" class="property-input" id="prop-label" value="${f.label}">
    </div>
  `;
  
  // Image upload
  if (isImage) {
    html += `
      <div class="property-group">
        <div class="property-label">Image</div>
        <input type="file" id="prop-image-upload" accept="image/*" style="font-size: 0.85em;">
        ${f.imageData ? '<p style="color: #10b981; font-size: 0.8em; margin-top: 5px;">✓ Image chargée</p>' : ''}
      </div>
    `;
  }
  
  // Options de formatage pour titre/texte
  if (isTitle) {
    html += `
      <div class="property-group">
        <div class="property-label">Police</div>
        <select class="property-select" id="prop-font-family">
          <option value="" ${!f.fontFamily ? 'selected' : ''}>Par défaut</option>
          <option value="Arial, sans-serif" ${f.fontFamily === 'Arial, sans-serif' ? 'selected' : ''}>Arial</option>
          <option value="'Times New Roman', serif" ${f.fontFamily === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
          <option value="Georgia, serif" ${f.fontFamily === 'Georgia, serif' ? 'selected' : ''}>Georgia</option>
          <option value="'Courier New', monospace" ${f.fontFamily === "'Courier New', monospace" ? 'selected' : ''}>Courier New</option>
          <option value="Verdana, sans-serif" ${f.fontFamily === 'Verdana, sans-serif' ? 'selected' : ''}>Verdana</option>
          <option value="'Trebuchet MS', sans-serif" ${f.fontFamily === "'Trebuchet MS', sans-serif" ? 'selected' : ''}>Trebuchet MS</option>
          <option value="Impact, sans-serif" ${f.fontFamily === 'Impact, sans-serif' ? 'selected' : ''}>Impact</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">Taille (pt)</div>
        <input type="number" class="property-input" id="prop-font-size" value="${f.fontSize || 14}" min="8" max="72" step="1">
      </div>
      <div class="property-group">
        <div class="property-label">Style</div>
        <div style="display: flex; gap: 5px;">
          <button type="button" class="toolbar-btn ${f.fontWeight === 'bold' ? 'active' : ''}" id="prop-bold" title="Gras" style="flex: 1; font-weight: bold;">G</button>
          <button type="button" class="toolbar-btn ${f.fontStyle === 'italic' ? 'active' : ''}" id="prop-italic" title="Italique" style="flex: 1; font-style: italic;">I</button>
          <button type="button" class="toolbar-btn ${f.textDecoration === 'underline' ? 'active' : ''}" id="prop-underline" title="Souligné" style="flex: 1; text-decoration: underline;">S</button>
        </div>
      </div>
      <div class="property-group">
        <div class="property-label">Alignement</div>
        <div style="display: flex; gap: 5px;">
          <button type="button" class="toolbar-btn ${!f.textAlign || f.textAlign === 'left' ? 'active' : ''}" id="prop-align-left" title="Gauche" style="flex: 1;">⬅</button>
          <button type="button" class="toolbar-btn ${f.textAlign === 'center' ? 'active' : ''}" id="prop-align-center" title="Centre" style="flex: 1;">⬌</button>
          <button type="button" class="toolbar-btn ${f.textAlign === 'right' ? 'active' : ''}" id="prop-align-right" title="Droite" style="flex: 1;">➡</button>
        </div>
      </div>
      <div class="property-group">
        <div class="property-label">Interligne</div>
        <select class="property-select" id="prop-line-height">
          <option value="1" ${f.lineHeight === '1' ? 'selected' : ''}>Simple</option>
          <option value="1.5" ${!f.lineHeight || f.lineHeight === '1.5' ? 'selected' : ''}>1.5</option>
          <option value="2" ${f.lineHeight === '2' ? 'selected' : ''}>Double</option>
        </select>
      </div>
    `;
  }
  
  // Divider (Filet) properties
  if (isDivider) {
    html += `
      <div class="property-group">
        <div class="property-label">Style</div>
        <select class="property-select" id="prop-divider-style">
          <option value="solid" ${!f.dividerStyle || f.dividerStyle === 'solid' ? 'selected' : ''}>Continu</option>
          <option value="dashed" ${f.dividerStyle === 'dashed' ? 'selected' : ''}>Tirets</option>
          <option value="dotted" ${f.dividerStyle === 'dotted' ? 'selected' : ''}>Pointillés</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">Épaisseur (px)</div>
        <input type="number" class="property-input" id="prop-divider-height" value="${f.dividerHeight || 2}" min="1" max="10" step="1">
      </div>
      <div class="property-group">
        <div class="property-label">Couleur</div>
        <input type="color" id="prop-divider-color" value="${f.dividerColor || '#cbd5e1'}" style="width: 100%; height: 32px; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer;">
      </div>
    `;
  }
  
  // QR Code properties
  if (isQRCode) {
    html += `
      <div class="property-group">
        <div class="property-label">Contenu du QR Code</div>
        <input type="text" class="property-input" id="prop-qr-content" value="${f.qrContent || 'https://gristup.fr'}" placeholder="URL ou texte">
      </div>
      <div class="property-group">
        <div class="property-label">Taille (px)</div>
        <input type="number" class="property-input" id="prop-qr-size" value="${f.qrSize || 100}" min="50" max="300" step="10">
      </div>
      <div class="property-group">
        <div class="property-label">Couleur</div>
        <input type="color" id="prop-qr-color" value="${f.qrColor || '#000000'}" style="width: 100%; height: 32px; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer;">
      </div>
      <div class="property-group">
        <div class="property-label">Type de contenu</div>
        <select class="property-select" id="prop-qr-type">
          <option value="custom" ${(f.qrType || 'custom') === 'custom' ? 'selected' : ''}>Personnalisé</option>
          <option value="record" ${f.qrType === 'record' ? 'selected' : ''}>Lien vers l'enregistrement</option>
          <option value="document" ${f.qrType === 'document' ? 'selected' : ''}>Lien vers le document</option>
        </select>
      </div>
    `;
  }
  
  // Calculated field properties
  const isCalculated = f.fieldType === 'calculated';
  if (isCalculated) {
    const numberFields = formFields.filter(field => 
      field.id !== f.id && field.fieldType === 'number'
    );
    
    html += `
      <div class="property-group">
        <div class="property-label">Type de calcul</div>
        <select class="property-select" id="prop-calc-type">
          <option value="sum" ${(f.calcType || 'sum') === 'sum' ? 'selected' : ''}>Somme (A + B)</option>
          <option value="subtract" ${f.calcType === 'subtract' ? 'selected' : ''}>Soustraction (A - B)</option>
          <option value="multiply" ${f.calcType === 'multiply' ? 'selected' : ''}>Multiplication (A × B)</option>
          <option value="divide" ${f.calcType === 'divide' ? 'selected' : ''}>Division (A ÷ B)</option>
          <option value="percentage" ${f.calcType === 'percentage' ? 'selected' : ''}>Pourcentage (A × B%)</option>
          <option value="custom" ${f.calcType === 'custom' ? 'selected' : ''}>Formule personnalisée</option>
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">Champ A</div>
        <select class="property-select" id="prop-calc-field-a">
          <option value="">-- Sélectionner --</option>
          ${numberFields.map(field => `<option value="${field.id}" ${f.calcFieldA === field.id ? 'selected' : ''}>${field.label}</option>`).join('')}
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">Champ B</div>
        <select class="property-select" id="prop-calc-field-b">
          <option value="">-- Sélectionner --</option>
          <option value="_constant" ${f.calcFieldB === '_constant' ? 'selected' : ''}>Valeur fixe</option>
          ${numberFields.map(field => `<option value="${field.id}" ${f.calcFieldB === field.id ? 'selected' : ''}>${field.label}</option>`).join('')}
        </select>
      </div>
      <div class="property-group" id="calc-constant-group" style="${f.calcFieldB === '_constant' ? '' : 'display: none;'}">
        <div class="property-label">Valeur fixe</div>
        <input type="number" class="property-input" id="prop-calc-constant" value="${f.calcConstant || 0}" step="any">
      </div>
      <div class="property-group" id="calc-formula-group" style="${f.calcType === 'custom' ? '' : 'display: none;'}">
        <div class="property-label">Formule (ex: A * B / 100)</div>
        <input type="text" class="property-input" id="prop-calc-formula" value="${f.calcFormula || ''}" placeholder="A * B">
      </div>
      <div class="property-group">
        <div class="property-label">Décimales</div>
        <input type="number" class="property-input" id="prop-calc-decimals" value="${f.calcDecimals !== undefined ? f.calcDecimals : 2}" min="0" max="6">
      </div>
      <div class="property-group">
        <div class="property-label">Suffixe (ex: €, %)</div>
        <input type="text" class="property-input" id="prop-calc-suffix" value="${f.calcSuffix || ''}" placeholder="€">
      </div>
    `;
  }
  
  // Lookup properties
  const isLookup = f.fieldType === 'lookup';
  if (isLookup) {
    html += `
      <div class="property-group">
        <div class="property-label">Table source</div>
        <select class="property-select" id="prop-lookup-table">
          <option value="">-- Sélectionner --</option>
          ${availableTables.map(t => `<option value="${t}" ${f.lookupTable === t ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="property-group">
        <div class="property-label">Colonne à afficher</div>
        <input type="text" class="property-input" id="prop-lookup-display" value="${f.lookupDisplayColumn || ''}" placeholder="Nom de la colonne">
      </div>
      <div class="property-group">
        <div class="property-label">Colonne de valeur</div>
        <input type="text" class="property-input" id="prop-lookup-value" value="${f.lookupValueColumn || ''}" placeholder="ID ou valeur à stocker">
      </div>
    `;
  }
  
  // Couleurs (pour section, titre et champs)
  if (isSection || isTitle) {
    html += `
      <div class="property-group">
        <div class="property-label">Couleur du texte</div>
        <input type="color" id="prop-text-color" value="${f.textColor || '#1e293b'}" style="width: 100%; height: 32px; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer;">
      </div>
      <div class="property-group">
        <div class="property-label">Couleur de fond</div>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.85em; cursor: pointer;">
          <input type="checkbox" id="prop-transparent" ${f.transparent ? 'checked' : ''}>
          Fond transparent
        </label>
        <input type="color" id="prop-bg-color" value="${f.bgColor || (isSection ? '#f8fafc' : '#ffffff')}" style="width: 100%; height: 32px; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer; ${f.transparent ? 'opacity: 0.5; pointer-events: none;' : ''}">
      </div>
    `;
  }
  
  // Couleur de fond pour les champs de saisie (sauf Section et Titre qui l'ont déjà)
  if (!isSection && !isTitle) {
    html += `
      <div class="property-group">
        <div class="property-label">Couleur de fond</div>
        <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 0.85em; cursor: pointer;">
          <input type="checkbox" id="prop-transparent" ${f.transparent ? 'checked' : ''}>
          Fond transparent
        </label>
        <input type="color" id="prop-bg-color" value="${f.bgColor || '#ffffff'}" style="width: 100%; height: 32px; border: 1px solid #e2e8f0; border-radius: 4px; cursor: pointer; ${f.transparent ? 'opacity: 0.5; pointer-events: none;' : ''}">
      </div>
    `;
  }
  
  if (!isDecorative) {
    if (f.columnId) {
      html += `
        <div class="property-group">
          <div class="property-label">Colonne Grist</div>
          <input type="text" class="property-input" value="${f.columnId}" disabled style="background: #f1f5f9;">
        </div>
      `;
    } else {
      html += `
        <div class="property-group">
          <div class="property-label" style="color: #f59e0b;">⚠️ Lier à une colonne</div>
          <select class="property-select" id="prop-column" style="border-color: #f59e0b;">
            <option value="">-- Non lié (données non sauvées) --</option>
            ${tableColumns.map(c => `<option value="${c.id}" ${f.columnId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
          <button class="btn btn-secondary" id="btn-create-column" style="margin-top: 8px; font-size: 0.8em; padding: 4px 8px;">➕ Créer colonne "${f.label}"</button>
        </div>
      `;
    }
    
    html += `
      <div class="property-group">
        <div class="property-label">Placeholder</div>
        <input type="text" class="property-input" id="prop-placeholder" value="${f.placeholder || ''}">
      </div>
    `;
    
    // Masquer le label
    html += `
      <div class="property-group">
        <label class="property-checkbox">
          <input type="checkbox" id="prop-hide-label" ${f.hideLabel ? 'checked' : ''}>
          Masquer le libellé
        </label>
      </div>
    `;
    
    // Position du label (seulement si le label n'est pas masqué)
    if (!f.hideLabel) {
      html += `
        <div class="property-group">
          <div class="property-label">Position du libellé</div>
          <select class="property-select" id="prop-label-position">
            <option value="top" ${(f.labelPosition || 'top') === 'top' ? 'selected' : ''}>En haut</option>
            <option value="left" ${f.labelPosition === 'left' ? 'selected' : ''}>À gauche</option>
          </select>
        </div>
      `;
    }
    
    // Validation rules
    html += `
      <div class="property-group" style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 12px;">
        <div class="property-label" style="font-weight: 600; color: #1e293b;">Validation</div>
      </div>
      <div class="property-group">
        <label class="property-checkbox">
          <input type="checkbox" id="prop-required" ${f.required ? 'checked' : ''}>
          Champ obligatoire
        </label>
      </div>
    `;
    
    // Min/Max for number fields
    if (f.fieldType === 'number') {
      html += `
        <div class="property-group">
          <div class="property-label">Valeur minimum</div>
          <input type="number" class="property-input" id="prop-min" value="${f.minValue !== undefined ? f.minValue : ''}">
        </div>
        <div class="property-group">
          <div class="property-label">Valeur maximum</div>
          <input type="number" class="property-input" id="prop-max" value="${f.maxValue !== undefined ? f.maxValue : ''}">
        </div>
      `;
    }
    
    // Min/Max length for text fields
    if (['text', 'textarea', 'email', 'phone'].includes(f.fieldType)) {
      html += `
        <div class="property-group">
          <div class="property-label">Longueur min</div>
          <input type="number" class="property-input" id="prop-min-length" value="${f.minLength || ''}" min="0">
        </div>
        <div class="property-group">
          <div class="property-label">Longueur max</div>
          <input type="number" class="property-input" id="prop-max-length" value="${f.maxLength || ''}" min="0">
        </div>
      `;
    }
    
    // Regex pattern
    if (['text', 'phone'].includes(f.fieldType)) {
      html += `
        <div class="property-group">
          <div class="property-label">Format (regex)</div>
          <select class="property-select" id="prop-pattern-preset">
            <option value="">-- Personnalisé --</option>
            <option value="email" ${f.patternPreset === 'email' ? 'selected' : ''}>Email</option>
            <option value="phone-fr" ${f.patternPreset === 'phone-fr' ? 'selected' : ''}>Téléphone FR (0X XX XX XX XX)</option>
            <option value="postal-fr" ${f.patternPreset === 'postal-fr' ? 'selected' : ''}>Code postal FR (5 chiffres)</option>
            <option value="siret" ${f.patternPreset === 'siret' ? 'selected' : ''}>SIRET (14 chiffres)</option>
            <option value="custom" ${f.patternPreset === 'custom' ? 'selected' : ''}>Regex personnalisé</option>
          </select>
        </div>
        <div class="property-group" id="custom-pattern-group" style="${f.patternPreset === 'custom' ? '' : 'display: none;'}">
          <div class="property-label">Regex personnalisé</div>
          <input type="text" class="property-input" id="prop-pattern" value="${f.pattern || ''}" placeholder="^[A-Z]{2}[0-9]{3}$">
        </div>
        <div class="property-group">
          <div class="property-label">Message d'erreur</div>
          <input type="text" class="property-input" id="prop-error-message" value="${f.errorMessage || ''}" placeholder="Format invalide">
        </div>
      `;
    }
  }
  
  // Conditions d'affichage (pour tous les champs sauf section)
  if (!isSection && !isImage && !isQRCode) {
    const otherFields = formFields.filter(field => 
      field.id !== f.id && 
      ['select', 'radio', 'checkbox', 'text', 'number'].includes(field.fieldType)
    );
    
    if (otherFields.length > 0) {
      html += `
        <div class="property-group" style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 12px;">
          <div class="property-label" style="font-weight: 600; color: #1e293b;">Affichage conditionnel</div>
        </div>
        <div class="property-group">
          <label class="property-checkbox">
            <input type="checkbox" id="prop-has-condition" ${f.condition ? 'checked' : ''}>
            Afficher si condition
          </label>
        </div>
        <div id="condition-options" style="${f.condition ? '' : 'display: none;'}">
          <div class="property-group">
            <div class="property-label">Champ de référence</div>
            <select class="property-select" id="prop-condition-field">
              <option value="">-- Sélectionner --</option>
              ${otherFields.map(field => `<option value="${field.id}" ${f.condition?.fieldId === field.id ? 'selected' : ''}>${field.label}</option>`).join('')}
            </select>
          </div>
          <div class="property-group">
            <div class="property-label">Opérateur</div>
            <select class="property-select" id="prop-condition-operator">
              <option value="equals" ${(f.condition?.operator || 'equals') === 'equals' ? 'selected' : ''}>Est égal à</option>
              <option value="not-equals" ${f.condition?.operator === 'not-equals' ? 'selected' : ''}>N'est pas égal à</option>
              <option value="contains" ${f.condition?.operator === 'contains' ? 'selected' : ''}>Contient</option>
              <option value="not-empty" ${f.condition?.operator === 'not-empty' ? 'selected' : ''}>N'est pas vide</option>
              <option value="empty" ${f.condition?.operator === 'empty' ? 'selected' : ''}>Est vide</option>
            </select>
          </div>
          <div class="property-group" id="condition-value-group" style="${['not-empty', 'empty'].includes(f.condition?.operator) ? 'display: none;' : ''}">
            <div class="property-label">Valeur</div>
            <input type="text" class="property-input" id="prop-condition-value" value="${f.condition?.value || ''}" placeholder="Valeur attendue">
          </div>
        </div>
      `;
    }
  }
  
  // Page du champ
  if (totalPages > 1) {
    const pageOptions = Array.from({length: totalPages}, (_, i) => i + 1)
      .map(p => `<option value="${p}" ${(f.page || 1) === p ? 'selected' : ''}>Page ${p}</option>`)
      .join('');
    html += `
      <div class="property-group">
        <div class="property-label">Page</div>
        <select class="property-select" id="prop-page">${pageOptions}</select>
      </div>
    `;
  }
  
  // Ordre d'affichage (z-index)
  html += `
    <div class="property-group">
      <div class="property-label">Ordre d'affichage</div>
      <div style="display: flex; gap: 6px;">
        <button class="btn btn-secondary" id="btn-bring-front" style="flex: 1; padding: 5px 8px; font-size: 0.75em;">⬆️ Premier plan</button>
        <button class="btn btn-secondary" id="btn-send-back" style="flex: 1; padding: 5px 8px; font-size: 0.75em;">⬇️ Arrière-plan</button>
      </div>
    </div>
  `;
  
  const widthCm = (f.width / 37.8).toFixed(1);
  html += `
    <div class="property-group">
      <div class="property-label">Largeur</div>
      <div style="display: flex; gap: 6px; align-items: center;">
        <input type="number" class="property-input" id="prop-width" value="${f.width}" min="50" max="800" style="flex: 1;">
        <span style="font-size: 0.75em; color: #64748b;">px</span>
        <input type="number" class="property-input" id="prop-width-cm" value="${widthCm}" min="1" max="21" step="0.1" style="flex: 1;">
        <span style="font-size: 0.75em; color: #64748b;">cm</span>
      </div>
    </div>
  `;
  
  if (isSection || isImage) {
    const heightCm = ((f.height || 100) / 37.8).toFixed(1);
    html += `
      <div class="property-group">
        <div class="property-label">Hauteur</div>
        <div style="display: flex; gap: 6px; align-items: center;">
          <input type="number" class="property-input" id="prop-height" value="${f.height || 100}" min="30" max="500" style="flex: 1;">
          <span style="font-size: 0.75em; color: #64748b;">px</span>
          <input type="number" class="property-input" id="prop-height-cm" value="${heightCm}" min="1" max="29" step="0.1" style="flex: 1;">
          <span style="font-size: 0.75em; color: #64748b;">cm</span>
        </div>
      </div>
    `;
  }
  
  if (!isDecorative) {
    html += `
      <div class="property-group">
        <label class="property-checkbox">
          <input type="checkbox" id="prop-required" ${f.required ? 'checked' : ''}>
          <span>Champ obligatoire</span>
        </label>
      </div>
    `;
  }
  
  // Options pour select/radio/checkbox
  if (hasOptions) {
    html += `
      <div class="property-group">
        <div class="property-label">Options</div>
        <div class="options-editor" id="options-editor">
          ${f.options.map((opt, i) => `
            <div class="option-row">
              <input type="text" value="${opt}" data-index="${i}">
              <button data-index="${i}">×</button>
            </div>
          `).join('')}
          <button class="add-option-btn" id="btn-add-option">+ Ajouter une option</button>
        </div>
      </div>
    `;
  }
  
  // Validation
  if (!isSection && f.fieldType !== 'signature') {
    html += `
      <div class="property-group">
        <div class="property-label">Validation</div>
        <select class="property-select" id="prop-validation-type">
          <option value="">Aucune</option>
          <option value="email" ${f.validation?.type === 'email' ? 'selected' : ''}>Email</option>
          <option value="phone" ${f.validation?.type === 'phone' ? 'selected' : ''}>Téléphone</option>
          <option value="min" ${f.validation?.type === 'min' ? 'selected' : ''}>Valeur minimum</option>
          <option value="max" ${f.validation?.type === 'max' ? 'selected' : ''}>Valeur maximum</option>
          <option value="regex" ${f.validation?.type === 'regex' ? 'selected' : ''}>Expression régulière</option>
        </select>
      </div>
      <div class="property-group" id="validation-value-group" style="display: ${f.validation?.type && ['min', 'max', 'regex'].includes(f.validation.type) ? 'block' : 'none'};">
        <div class="property-label">Valeur de validation</div>
        <input type="text" class="property-input" id="prop-validation-value" value="${f.validation?.value || ''}">
      </div>
    `;
  }
  
  // Condition d'affichage
  if (!isSection) {
    const otherFields = formFields.filter(of => of.id !== f.id && of.columnId);
    html += `
      <div class="property-group">
        <div class="property-label">Condition d'affichage</div>
        <select class="property-select" id="prop-condition-field">
          <option value="">Toujours visible</option>
          ${otherFields.map(of => `<option value="${of.id}" ${f.condition?.fieldId === of.id ? 'selected' : ''}>${of.label}</option>`).join('')}
        </select>
      </div>
      <div id="condition-details" style="display: ${f.condition ? 'block' : 'none'};">
        <div class="property-group">
          <div class="property-label">Opérateur</div>
          <select class="property-select" id="prop-condition-operator">
            <option value="equals" ${f.condition?.operator === 'equals' ? 'selected' : ''}>Égal à</option>
            <option value="not_equals" ${f.condition?.operator === 'not_equals' ? 'selected' : ''}>Différent de</option>
            <option value="contains" ${f.condition?.operator === 'contains' ? 'selected' : ''}>Contient</option>
            <option value="not_empty" ${f.condition?.operator === 'not_empty' ? 'selected' : ''}>Non vide</option>
          </select>
        </div>
        <div class="property-group" id="condition-value-group">
          <div class="property-label">Valeur</div>
          <input type="text" class="property-input" id="prop-condition-value" value="${f.condition?.value || ''}">
        </div>
      </div>
    `;
  }
  
  propertiesContent.innerHTML = html;
  
  // Event listeners
  document.getElementById('prop-label')?.addEventListener('input', (e) => {
    selectedField.label = e.target.value;
    // Mettre à jour le texte directement sans re-render complet
    const fieldEl = formCanvas.querySelector(`[data-field-id="${selectedField.id}"]`);
    if (fieldEl) {
      if (selectedField.fieldType === 'title') {
        const span = fieldEl.querySelector('span');
        if (span) span.textContent = e.target.value;
      } else if (selectedField.fieldType === 'section') {
        const title = fieldEl.querySelector('.form-section-title');
        if (title) title.textContent = e.target.value;
      } else {
        const label = fieldEl.querySelector('.form-field-label');
        if (label) label.textContent = e.target.value + (selectedField.required ? ' *' : '');
      }
    }
  });
  
  document.getElementById('prop-placeholder')?.addEventListener('change', (e) => {
    selectedField.placeholder = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-hide-label')?.addEventListener('change', (e) => {
    selectedField.hideLabel = e.target.checked;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-label-position')?.addEventListener('change', (e) => {
    selectedField.labelPosition = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-width')?.addEventListener('input', (e) => {
    selectedField.width = parseInt(e.target.value) || 200;
    // Mettre à jour le champ cm
    const cmInput = document.getElementById('prop-width-cm');
    if (cmInput) cmInput.value = (selectedField.width / 37.8).toFixed(1);
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-width-cm')?.addEventListener('change', (e) => {
    const cm = parseFloat(e.target.value) || 5;
    selectedField.width = Math.round(cm * 37.8);
    // Mettre à jour le champ px
    const pxInput = document.getElementById('prop-width');
    if (pxInput) pxInput.value = selectedField.width;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-height')?.addEventListener('input', (e) => {
    selectedField.height = parseInt(e.target.value) || 150;
    // Mettre à jour le champ cm
    const cmInput = document.getElementById('prop-height-cm');
    if (cmInput) cmInput.value = (selectedField.height / 37.8).toFixed(1);
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-height-cm')?.addEventListener('change', (e) => {
    const cm = parseFloat(e.target.value) || 3;
    selectedField.height = Math.round(cm * 37.8);
    // Mettre à jour le champ px
    const pxInput = document.getElementById('prop-height');
    if (pxInput) pxInput.value = selectedField.height;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Upload image
  document.getElementById('prop-image-upload')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        selectedField.imageData = event.target.result;
        renderFormFields();
        selectField(selectedField.id);
        renderPropertiesPanel();
        showToast('Image chargée', 'success');
      };
      reader.readAsDataURL(file);
    }
  });
  
  // Taille de police
  document.getElementById('prop-font-size')?.addEventListener('change', (e) => {
    selectedField.fontSize = parseFloat(e.target.value) || 14;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Police
  document.getElementById('prop-font-family')?.addEventListener('change', (e) => {
    selectedField.fontFamily = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Gras
  document.getElementById('prop-bold')?.addEventListener('click', () => {
    selectedField.fontWeight = selectedField.fontWeight === 'bold' ? '' : 'bold';
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Italique
  document.getElementById('prop-italic')?.addEventListener('click', () => {
    selectedField.fontStyle = selectedField.fontStyle === 'italic' ? '' : 'italic';
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Souligné
  document.getElementById('prop-underline')?.addEventListener('click', () => {
    selectedField.textDecoration = selectedField.textDecoration === 'underline' ? '' : 'underline';
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Alignement
  document.getElementById('prop-align-left')?.addEventListener('click', () => {
    selectedField.textAlign = 'left';
    renderFormFields();
    selectField(selectedField.id);
  });
  document.getElementById('prop-align-center')?.addEventListener('click', () => {
    selectedField.textAlign = 'center';
    renderFormFields();
    selectField(selectedField.id);
  });
  document.getElementById('prop-align-right')?.addEventListener('click', () => {
    selectedField.textAlign = 'right';
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Interligne
  document.getElementById('prop-line-height')?.addEventListener('change', (e) => {
    selectedField.lineHeight = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Couleur du texte
  document.getElementById('prop-text-color')?.addEventListener('change', (e) => {
    selectedField.textColor = e.target.value;
    renderFormFields();
    // Ne pas re-render le panneau pour éviter de fermer la palette
    const fieldEl = formCanvas.querySelector(`[data-field-id="${selectedField.id}"]`);
    if (fieldEl) fieldEl.classList.add('selected');
  });
  
  // Couleur de fond
  document.getElementById('prop-bg-color')?.addEventListener('change', (e) => {
    selectedField.bgColor = e.target.value;
    selectedField.transparent = false;
    renderFormFields();
    // Ne pas re-render le panneau pour éviter de fermer la palette
    const fieldEl = formCanvas.querySelector(`[data-field-id="${selectedField.id}"]`);
    if (fieldEl) fieldEl.classList.add('selected');
  });
  
  // Fond transparent
  document.getElementById('prop-transparent')?.addEventListener('change', (e) => {
    selectedField.transparent = e.target.checked;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Divider (Filet) properties
  document.getElementById('prop-divider-style')?.addEventListener('change', (e) => {
    selectedField.dividerStyle = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-divider-height')?.addEventListener('change', (e) => {
    selectedField.dividerHeight = parseInt(e.target.value) || 2;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-divider-color')?.addEventListener('change', (e) => {
    selectedField.dividerColor = e.target.value;
    renderFormFields();
    const fieldEl = formCanvas.querySelector(`[data-field-id="${selectedField.id}"]`);
    if (fieldEl) fieldEl.classList.add('selected');
  });
  
  // QR Code properties
  document.getElementById('prop-qr-content')?.addEventListener('change', (e) => {
    selectedField.qrContent = e.target.value;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-qr-size')?.addEventListener('change', (e) => {
    selectedField.qrSize = parseInt(e.target.value) || 100;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  document.getElementById('prop-qr-color')?.addEventListener('change', (e) => {
    selectedField.qrColor = e.target.value;
    renderFormFields();
    // Ne pas re-render le panneau pour éviter de fermer la palette
    const fieldEl = formCanvas.querySelector(`[data-field-id="${selectedField.id}"]`);
    if (fieldEl) fieldEl.classList.add('selected');
  });
  
  document.getElementById('prop-qr-type')?.addEventListener('change', async (e) => {
    selectedField.qrType = e.target.value;
    if (e.target.value === 'record') {
      // Générer le lien vers l'enregistrement actuel
      try {
        const docId = await grist.docApi.getDocName();
        selectedField.qrContent = `https://docs.getgrist.com/doc/${docId}`;
      } catch (err) {
        selectedField.qrContent = 'Lien enregistrement';
      }
    } else if (e.target.value === 'document') {
      try {
        const docId = await grist.docApi.getDocName();
        selectedField.qrContent = `https://docs.getgrist.com/doc/${docId}`;
      } catch (err) {
        selectedField.qrContent = 'Lien document';
      }
    }
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Changer de page
  document.getElementById('prop-page')?.addEventListener('change', (e) => {
    selectedField.page = parseInt(e.target.value);
    renderFormFields();
    selectedField = null;
    renderPropertiesPanel();
    showToast('Champ déplacé vers la page ' + e.target.value, 'success');
  });
  
  // Ordre d'affichage
  document.getElementById('btn-bring-front')?.addEventListener('click', () => {
    bringToFront(selectedField.id);
  });
  
  document.getElementById('btn-send-back')?.addEventListener('click', () => {
    sendToBack(selectedField.id);
  });
  
  document.getElementById('prop-required')?.addEventListener('change', (e) => {
    selectedField.required = e.target.checked;
    renderFormFields();
    selectField(selectedField.id);
  });
  
  // Min/Max for numbers
  document.getElementById('prop-min')?.addEventListener('change', (e) => {
    selectedField.minValue = e.target.value !== '' ? parseFloat(e.target.value) : undefined;
  });
  
  document.getElementById('prop-max')?.addEventListener('change', (e) => {
    selectedField.maxValue = e.target.value !== '' ? parseFloat(e.target.value) : undefined;
  });
  
  // Min/Max length for text
  document.getElementById('prop-min-length')?.addEventListener('change', (e) => {
    selectedField.minLength = e.target.value !== '' ? parseInt(e.target.value) : undefined;
  });
  
  document.getElementById('prop-max-length')?.addEventListener('change', (e) => {
    selectedField.maxLength = e.target.value !== '' ? parseInt(e.target.value) : undefined;
  });
  
  // Pattern preset
  document.getElementById('prop-pattern-preset')?.addEventListener('change', (e) => {
    selectedField.patternPreset = e.target.value;
    const customGroup = document.getElementById('custom-pattern-group');
    
    const patterns = {
      'email': '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
      'phone-fr': '^0[1-9]([ .-]?[0-9]{2}){4}$',
      'postal-fr': '^[0-9]{5}$',
      'siret': '^[0-9]{14}$'
    };
    
    if (e.target.value === 'custom') {
      if (customGroup) customGroup.style.display = '';
    } else {
      if (customGroup) customGroup.style.display = 'none';
      selectedField.pattern = patterns[e.target.value] || '';
    }
  });
  
  // Custom pattern
  document.getElementById('prop-pattern')?.addEventListener('change', (e) => {
    selectedField.pattern = e.target.value;
  });
  
  // Error message
  document.getElementById('prop-error-message')?.addEventListener('change', (e) => {
    selectedField.errorMessage = e.target.value;
  });
  
  // Calculated field properties
  document.getElementById('prop-calc-type')?.addEventListener('change', (e) => {
    selectedField.calcType = e.target.value;
    const formulaGroup = document.getElementById('calc-formula-group');
    if (e.target.value === 'custom') {
      if (formulaGroup) formulaGroup.style.display = '';
    } else {
      if (formulaGroup) formulaGroup.style.display = 'none';
    }
  });
  
  document.getElementById('prop-calc-field-a')?.addEventListener('change', (e) => {
    selectedField.calcFieldA = e.target.value;
  });
  
  document.getElementById('prop-calc-field-b')?.addEventListener('change', (e) => {
    selectedField.calcFieldB = e.target.value;
    const constantGroup = document.getElementById('calc-constant-group');
    if (e.target.value === '_constant') {
      if (constantGroup) constantGroup.style.display = '';
    } else {
      if (constantGroup) constantGroup.style.display = 'none';
    }
  });
  
  document.getElementById('prop-calc-constant')?.addEventListener('change', (e) => {
    selectedField.calcConstant = parseFloat(e.target.value) || 0;
  });
  
  document.getElementById('prop-calc-formula')?.addEventListener('change', (e) => {
    selectedField.calcFormula = e.target.value;
  });
  
  document.getElementById('prop-calc-decimals')?.addEventListener('change', (e) => {
    selectedField.calcDecimals = parseInt(e.target.value) || 0;
  });
  
  document.getElementById('prop-calc-suffix')?.addEventListener('change', (e) => {
    selectedField.calcSuffix = e.target.value;
  });
  
  // Lookup properties
  document.getElementById('prop-lookup-table')?.addEventListener('change', (e) => {
    selectedField.lookupTable = e.target.value;
    // Charger les données de la table pour l'autocomplétion
    if (e.target.value) {
      loadLookupData(selectedField);
    }
  });
  
  document.getElementById('prop-lookup-display')?.addEventListener('change', (e) => {
    selectedField.lookupDisplayColumn = e.target.value;
  });
  
  document.getElementById('prop-lookup-value')?.addEventListener('change', (e) => {
    selectedField.lookupValueColumn = e.target.value;
  });
  
  // Conditional display
  document.getElementById('prop-has-condition')?.addEventListener('change', (e) => {
    const conditionOptions = document.getElementById('condition-options');
    if (e.target.checked) {
      selectedField.condition = { fieldId: '', operator: 'equals', value: '' };
      if (conditionOptions) conditionOptions.style.display = '';
    } else {
      selectedField.condition = null;
      if (conditionOptions) conditionOptions.style.display = 'none';
    }
  });
  
  document.getElementById('prop-condition-field')?.addEventListener('change', (e) => {
    if (selectedField.condition) {
      selectedField.condition.fieldId = e.target.value;
    }
  });
  
  document.getElementById('prop-condition-operator')?.addEventListener('change', (e) => {
    if (selectedField.condition) {
      selectedField.condition.operator = e.target.value;
      const valueGroup = document.getElementById('condition-value-group');
      if (['not-empty', 'empty'].includes(e.target.value)) {
        if (valueGroup) valueGroup.style.display = 'none';
      } else {
        if (valueGroup) valueGroup.style.display = '';
      }
    }
  });
  
  document.getElementById('prop-condition-value')?.addEventListener('change', (e) => {
    if (selectedField.condition) {
      selectedField.condition.value = e.target.value;
    }
  });
  
  document.getElementById('prop-column')?.addEventListener('change', (e) => {
    selectedField.columnId = e.target.value || null;
    // Mettre à jour le libellé avec le nom de la colonne
    if (e.target.value) {
      selectedField.label = e.target.value;
      document.getElementById('prop-label').value = e.target.value;
      renderFormFields();
      selectField(selectedField.id);
    }
  });
  
  // Créer une nouvelle colonne dans Grist
  document.getElementById('btn-create-column')?.addEventListener('click', async () => {
    if (!currentTable) {
      showToast('Veuillez sélectionner une table', 'error');
      return;
    }
    
    const columnName = selectedField.label.replace(/[^a-zA-Z0-9_àâäéèêëïîôùûüç]/gi, '_');
    
    // Déterminer le type de colonne Grist selon le type de champ
    let gristType = 'Text';
    if (selectedField.fieldType === 'number') gristType = 'Numeric';
    else if (selectedField.fieldType === 'date') gristType = 'Date';
    else if (selectedField.fieldType === 'email') gristType = 'Text';
    else if (selectedField.fieldType === 'checkbox') gristType = 'ChoiceList';
    else if (selectedField.fieldType === 'select' || selectedField.fieldType === 'radio') gristType = 'Choice';
    
    try {
      showLoading();
      await grist.docApi.applyUserActions([
        ['AddColumn', currentTable, columnName, { type: gristType }]
      ]);
      
      // Lier le champ à la nouvelle colonne
      selectedField.columnId = columnName;
      
      // Recharger les colonnes
      await loadTableColumns(currentTable);
      
      hideLoading();
      renderFormFields();
      selectField(selectedField.id);
      showToast(`Colonne "${columnName}" créée et liée`, 'success');
    } catch (error) {
      hideLoading();
      console.error('Erreur création colonne:', error);
      showToast('Erreur lors de la création de la colonne', 'error');
    }
  });
  
  // Options
  if (hasOptions) {
    document.querySelectorAll('#options-editor .option-row input').forEach(input => {
      input.addEventListener('input', (e) => {
        const index = parseInt(e.target.dataset.index);
        selectedField.options[index] = e.target.value;
        renderFormFields();
        selectField(selectedField.id);
      });
    });
    
    document.querySelectorAll('#options-editor .option-row button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        selectedField.options.splice(index, 1);
        renderPropertiesPanel();
        renderFormFields();
        selectField(selectedField.id);
      });
    });
    
    document.getElementById('btn-add-option')?.addEventListener('click', () => {
      selectedField.options.push('Nouvelle option');
      renderPropertiesPanel();
      renderFormFields();
      selectField(selectedField.id);
    });
  }
  
  // Validation
  document.getElementById('prop-validation-type')?.addEventListener('change', (e) => {
    const type = e.target.value;
    selectedField.validation = type ? { type: type, value: '' } : {};
    const valueGroup = document.getElementById('validation-value-group');
    if (valueGroup) {
      valueGroup.style.display = ['min', 'max', 'regex'].includes(type) ? 'block' : 'none';
    }
  });
  
  document.getElementById('prop-validation-value')?.addEventListener('input', (e) => {
    if (selectedField.validation) {
      selectedField.validation.value = e.target.value;
    }
  });
  
  // Conditions
  document.getElementById('prop-condition-field')?.addEventListener('change', (e) => {
    const fieldId = e.target.value;
    if (fieldId) {
      selectedField.condition = { fieldId: fieldId, operator: 'equals', value: '' };
      document.getElementById('condition-details').style.display = 'block';
    } else {
      selectedField.condition = null;
      document.getElementById('condition-details').style.display = 'none';
    }
  });
  
  document.getElementById('prop-condition-operator')?.addEventListener('change', (e) => {
    if (selectedField.condition) {
      selectedField.condition.operator = e.target.value;
      const valueGroup = document.getElementById('condition-value-group');
      if (valueGroup) {
        valueGroup.style.display = e.target.value === 'not_empty' ? 'none' : 'block';
      }
    }
  });
  
  document.getElementById('prop-condition-value')?.addEventListener('input', (e) => {
    if (selectedField.condition) {
      selectedField.condition.value = e.target.value;
    }
  });
}

// Sauvegarder la configuration
async function saveFormConfig() {
  if (!currentTable) {
    showToast('Veuillez sélectionner une table', 'error');
    return;
  }
  
  const config = {
    tableId: currentTable,
    fields: formFields,
    title: formTitleInput.value || 'Formulaire ' + currentTable,
    templates: templates,
    totalPages: totalPages,
    versionHistory: versionHistory.slice(0, 10), // Garder les 10 dernières versions
    // Config des rôles (restriction de soumission)
    rolesTable: formConfig?.rolesTable || '',
    rolesEmailColumn: formConfig?.rolesEmailColumn || '',
    rolesRoleColumn: formConfig?.rolesRoleColumn || '',
    allowedRoles: formConfig?.allowedRoles || []
  };
  
  try {
    await grist.setOptions(config);
    formConfig = config;
    
    // Aussi sauvegarder dans une table BM_FormConfig pour partage entre widgets
    await saveConfigToTable(config);
    
    showToast('Configuration sauvegardée', 'success');
  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    showToast('Erreur lors de la sauvegarde', 'error');
  }
}

// Sauvegarder la config dans une table Grist pour partage
async function saveConfigToTable(config) {
  try {
    const tables = await grist.docApi.listTables();
    const configTableName = 'BM_FormConfig';
    
    // Créer la table si elle n'existe pas
    if (!tables.includes(configTableName)) {
      await grist.docApi.applyUserActions([
        ['AddTable', configTableName, [
          { id: 'ConfigKey', type: 'Text' },
          { id: 'ConfigData', type: 'Text' }
        ]]
      ]);
    }
    
    // Chercher si une config existe déjà
    const existingData = await grist.docApi.fetchTable(configTableName);
    const configJson = JSON.stringify(config);
    const configKey = 'form_' + (config.tableId || 'default');
    
    const existingIndex = existingData.ConfigKey?.findIndex(k => k === configKey);
    
    if (existingIndex !== undefined && existingIndex >= 0) {
      // Mettre à jour
      const rowId = existingData.id[existingIndex];
      await grist.docApi.applyUserActions([
        ['UpdateRecord', configTableName, rowId, { ConfigData: configJson }]
      ]);
    } else {
      // Créer
      await grist.docApi.applyUserActions([
        ['AddRecord', configTableName, null, { ConfigKey: configKey, ConfigData: configJson }]
      ]);
    }
  } catch (error) {
    console.log('Erreur sauvegarde table config:', error);
    // Ne pas bloquer si la sauvegarde dans la table échoue
  }
}

// Charger la config depuis la table Grist
async function loadConfigFromTable(tableId) {
  try {
    const tables = await grist.docApi.listTables();
    const configTableName = 'BM_FormConfig';
    
    if (!tables.includes(configTableName)) {
      return null;
    }
    
    const data = await grist.docApi.fetchTable(configTableName);
    const configKey = 'form_' + (tableId || 'default');
    
    const index = data.ConfigKey?.findIndex(k => k === configKey);
    
    if (index !== undefined && index >= 0) {
      return JSON.parse(data.ConfigData[index]);
    }
  } catch (error) {
    console.log('Erreur chargement config table:', error);
  }
  return null;
}

// Créer un nouveau formulaire
async function newForm() {
  const confirmed = await showConfirm({
    icon: '📝',
    title: 'Nouveau formulaire',
    message: 'Créer un nouveau formulaire ? Le formulaire actuel sera perdu si non sauvegardé.',
    confirmText: 'Nouveau',
    cancelText: 'Annuler'
  });
  
  if (confirmed) {
    formFields = [];
    selectedField = null;
    totalPages = 1;
    currentPage = 1;
    formTitleInput.value = 'Nouveau formulaire';
    tableSelect.value = '';
    currentTable = null;
    updatePageIndicator();
    renderFormFields();
    renderPropertiesPanel();
    showToast('Nouveau formulaire créé', 'success');
  }
}

// Vider le formulaire
async function clearForm() {
  if (formFields.length === 0) return;
  
  const confirmed = await showConfirm({
    icon: '🗑️',
    title: 'Vider le formulaire',
    message: 'Voulez-vous vraiment supprimer tous les champs ?',
    confirmText: 'Supprimer',
    cancelText: 'Annuler',
    danger: true
  });
  
  if (confirmed) {
    formFields = [];
    selectedField = null;
    renderFormFields();
    renderPropertiesPanel();
    showToast('Formulaire vidé', 'success');
  }
}

// Basculer entre les modes
function switchMode(mode) {
  const guideView = document.getElementById('guide-view');
  const btnModeGuide = document.getElementById('btn-mode-guide');
  
  // Réinitialiser tous les états
  editorView.classList.add('hidden');
  formView.classList.remove('active');
  guideView?.classList.remove('active');
  btnModeEdit.classList.remove('active');
  btnModeFill.classList.remove('active');
  btnModeGuide?.classList.remove('active');
  
  if (mode === 'edit') {
    editorView.classList.remove('hidden');
    btnModeEdit.classList.add('active');
  } else if (mode === 'fill') {
    formView.classList.add('active');
    btnModeFill.classList.add('active');
    renderFormView();
  } else if (mode === 'guide') {
    guideView?.classList.add('active');
    btnModeGuide?.classList.add('active');
  }
}

// Afficher la navigation entre pages dans le mode saisie
function renderFormViewPageNav() {
  // Supprimer l'ancienne navigation si elle existe
  const existingNav = document.getElementById('form-view-page-nav');
  if (existingNav) existingNav.remove();
  
  // Ne pas afficher si une seule page
  if (totalPages <= 1) return;
  
  const nav = document.createElement('div');
  nav.id = 'form-view-page-nav';
  nav.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 15px; padding: 15px; background: white; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);';
  
  nav.innerHTML = `
    <button id="form-view-prev" class="btn btn-secondary" style="padding: 8px 16px;" ${currentPage === 1 ? 'disabled' : ''}>◀ Précédent</button>
    <span style="font-weight: 600; color: #475569;">Page ${currentPage} / ${totalPages}</span>
    <button id="form-view-next" class="btn btn-primary" style="padding: 8px 16px;" ${currentPage === totalPages ? 'disabled' : ''}>Suivant ▶</button>
  `;
  
  // Insérer avant le canvas
  const canvasView = document.getElementById('form-canvas-view');
  canvasView.parentNode.insertBefore(nav, canvasView);
  
  // Event listeners
  document.getElementById('form-view-prev')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderFormView();
    }
  });
  
  document.getElementById('form-view-next')?.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderFormView();
    }
  });
}

// Évaluer et appliquer les conditions d'affichage
function evaluateConditions() {
  if (!formConfig || !formConfig.fields) return;
  
  formConfig.fields.forEach(field => {
    if (!field.condition || !field.condition.fieldId) return;
    
    const group = document.querySelector(`.form-field-view[data-field-id="${field.id}"]`);
    if (!group) return;
    
    const refField = formConfig.fields.find(f => f.id === field.condition.fieldId);
    if (!refField) return;
    
    // Obtenir la valeur du champ de référence
    let refValue = '';
    if (refField.fieldType === 'radio') {
      const container = document.getElementById(`input-${refField.id}`);
      const checked = container?.querySelector('input:checked');
      refValue = checked ? checked.value : '';
    } else if (refField.fieldType === 'checkbox') {
      const container = document.getElementById(`input-${refField.id}`);
      const checked = container?.querySelectorAll('input:checked');
      refValue = checked ? Array.from(checked).map(c => c.value).join(',') : '';
    } else if (refField.fieldType === 'select') {
      const select = document.getElementById(`input-${refField.id}`);
      refValue = select ? select.value : '';
    } else {
      const input = document.getElementById(`input-${refField.id}`);
      refValue = input ? input.value : '';
    }
    
    // Évaluer la condition
    let conditionMet = false;
    const condValue = field.condition.value || '';
    
    switch (field.condition.operator) {
      case 'equals':
        conditionMet = refValue === condValue;
        break;
      case 'not-equals':
        conditionMet = refValue !== condValue;
        break;
      case 'contains':
        conditionMet = refValue.toLowerCase().includes(condValue.toLowerCase());
        break;
      case 'not-empty':
        conditionMet = refValue !== '' && refValue !== null;
        break;
      case 'empty':
        conditionMet = refValue === '' || refValue === null;
        break;
    }
    
    // Afficher ou masquer le champ
    if (conditionMet) {
      group.classList.remove('hidden');
    } else {
      group.classList.add('hidden');
    }
  });
}

// Afficher le formulaire de saisie
function renderFormView() {
  if (!formConfig || !formConfig.fields || formConfig.fields.length === 0) {
    formFieldsView.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 40px;">Aucun formulaire configuré.</p>';
    return;
  }
  
  formFieldsView.innerHTML = '';
  
  // Filtrer les champs de la page courante
  const pageFields = formConfig.fields.filter(f => (f.page || 1) === currentPage);
  
  // Calculer la hauteur minimale du canvas
  let maxY = 297; // A4 height in mm (converted to approximate px later)
  pageFields.forEach(field => {
    const fieldBottom = field.y + (field.height || 80);
    if (fieldBottom > maxY) maxY = fieldBottom;
  });
  
  const canvasView = document.getElementById('form-canvas-view');
  canvasView.style.minHeight = Math.max(maxY + 100, 800) + 'px';
  
  // Afficher la navigation si plusieurs pages
  renderFormViewPageNav();
  
  pageFields.forEach(field => {
    if (field.fieldType === 'section') {
      const sectionDiv = document.createElement('div');
      sectionDiv.className = 'form-section-view';
      sectionDiv.style.position = 'absolute';
      sectionDiv.style.left = field.x + 'px';
      sectionDiv.style.top = field.y + 'px';
      sectionDiv.style.width = field.width + 'px';
      sectionDiv.style.height = (field.height || 150) + 'px';
      if (field.transparent) {
        sectionDiv.style.backgroundColor = 'transparent';
        sectionDiv.style.border = '1px dashed #cbd5e1';
      } else if (field.bgColor) {
        sectionDiv.style.backgroundColor = field.bgColor;
      }
      sectionDiv.innerHTML = `<div class="form-section-view-title" style="${field.textColor ? 'color:' + field.textColor : ''}">${field.label}</div>`;
      formFieldsView.appendChild(sectionDiv);
      return;
    }
    
    // Image
    if (field.fieldType === 'image') {
      const imageDiv = document.createElement('div');
      imageDiv.style.position = 'absolute';
      imageDiv.style.left = field.x + 'px';
      imageDiv.style.top = field.y + 'px';
      imageDiv.style.width = field.width + 'px';
      imageDiv.style.height = (field.height || 100) + 'px';
      // Appliquer la couleur de fond
      if (field.transparent) {
        imageDiv.style.backgroundColor = 'transparent';
      } else if (field.bgColor) {
        imageDiv.style.backgroundColor = field.bgColor;
      }
      if (field.imageData) {
        imageDiv.innerHTML = `<img src="${field.imageData}" alt="${field.label}" style="width: 100%; height: 100%; object-fit: contain;">`;
      }
      formFieldsView.appendChild(imageDiv);
      return;
    }
    
    // Titre/Texte
    if (field.fieldType === 'title') {
      const titleDiv = document.createElement('div');
      titleDiv.style.position = 'absolute';
      titleDiv.style.left = field.x + 'px';
      titleDiv.style.top = field.y + 'px';
      titleDiv.style.width = field.width + 'px';
      titleDiv.style.fontSize = (field.fontSize || 14) + 'pt';
      titleDiv.style.fontWeight = field.fontWeight || '600';
      titleDiv.style.color = field.textColor || '#1e293b';
      if (field.fontFamily) titleDiv.style.fontFamily = field.fontFamily;
      if (field.fontStyle) titleDiv.style.fontStyle = field.fontStyle;
      if (field.textDecoration) titleDiv.style.textDecoration = field.textDecoration;
      if (field.textAlign) titleDiv.style.textAlign = field.textAlign;
      if (field.lineHeight) titleDiv.style.lineHeight = field.lineHeight;
      if (field.transparent) {
        titleDiv.style.backgroundColor = 'transparent';
      } else if (field.bgColor) {
        titleDiv.style.backgroundColor = field.bgColor;
        titleDiv.style.padding = '8px 12px';
        titleDiv.style.borderRadius = '6px';
      }
      titleDiv.textContent = field.label;
      formFieldsView.appendChild(titleDiv);
      return;
    }
    
    // Filet (Divider)
    if (field.fieldType === 'divider') {
      const dividerDiv = document.createElement('div');
      dividerDiv.style.position = 'absolute';
      dividerDiv.style.left = field.x + 'px';
      dividerDiv.style.top = field.y + 'px';
      dividerDiv.style.width = field.width + 'px';
      
      const lineStyle = field.dividerStyle === 'dashed' ? 'dashed' : (field.dividerStyle === 'dotted' ? 'dotted' : 'solid');
      dividerDiv.innerHTML = `<div style="width: 100%; height: 0; border-top: ${field.dividerHeight || 2}px ${lineStyle} ${field.dividerColor || '#cbd5e1'};"></div>`;
      
      formFieldsView.appendChild(dividerDiv);
      return;
    }
    
    // QR Code
    if (field.fieldType === 'qrcode') {
      const qrcodeDiv = document.createElement('div');
      qrcodeDiv.style.position = 'absolute';
      qrcodeDiv.style.left = field.x + 'px';
      qrcodeDiv.style.top = field.y + 'px';
      qrcodeDiv.style.padding = '8px';
      // Appliquer la couleur de fond
      if (field.transparent) {
        qrcodeDiv.style.background = 'transparent';
      } else if (field.bgColor) {
        qrcodeDiv.style.background = field.bgColor;
      } else {
        qrcodeDiv.style.background = 'white';
      }
      qrcodeDiv.id = 'qr-view-' + field.id;
      formFieldsView.appendChild(qrcodeDiv);
      
      // Générer le QR Code après l'ajout au DOM
      setTimeout(() => {
        const container = document.getElementById('qr-view-' + field.id);
        if (container && typeof QRCode !== 'undefined') {
          container.innerHTML = '';
          new QRCode(container, {
            text: field.qrContent || 'https://gristup.fr',
            width: field.qrSize || 100,
            height: field.qrSize || 100,
            colorDark: field.qrColor || '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.M
          });
        }
      }, 50);
      return;
    }
    
    const group = document.createElement('div');
    group.className = 'form-field-view';
    group.dataset.fieldId = field.id;
    group.style.left = field.x + 'px';
    group.style.top = field.y + 'px';
    group.style.width = field.width + 'px';
    
    // Appliquer la couleur de fond
    if (field.transparent) {
      group.style.backgroundColor = 'transparent';
    } else if (field.bgColor) {
      group.style.backgroundColor = field.bgColor;
    }
    
    if (field.condition) {
      group.dataset.conditionFieldId = field.condition.fieldId;
      group.dataset.conditionOperator = field.condition.operator;
      group.dataset.conditionValue = field.condition.value || '';
    }
    
    let inputHtml = '';
    
    switch (field.fieldType) {
      case 'textarea':
        inputHtml = `<textarea id="input-${field.id}" class="form-textarea-input" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''} style="min-height: 60px;"></textarea>`;
        break;
      case 'select':
        inputHtml = `<select id="input-${field.id}" class="form-select" ${field.required ? 'required' : ''}>
          <option value="">${field.placeholder || 'Sélectionner...'}</option>
          ${field.options.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>`;
        break;
      case 'radio':
        inputHtml = `<div class="form-radio-group" id="input-${field.id}">
          ${field.options.map((o, i) => `
            <label class="form-radio-item">
              <input type="radio" name="radio-${field.id}" value="${o}">
              <span>${o}</span>
            </label>
          `).join('')}
        </div>`;
        break;
      case 'checkbox':
        inputHtml = `<div class="form-checkbox-group" id="input-${field.id}">
          ${field.options.map(o => `
            <label class="form-checkbox-item">
              <input type="checkbox" value="${o}">
              <span>${o}</span>
            </label>
          `).join('')}
        </div>`;
        break;
      case 'signature':
        inputHtml = `
          <div class="signature-canvas-container">
            <canvas id="input-${field.id}" class="signature-canvas"></canvas>
            <button type="button" class="signature-clear" data-canvas="input-${field.id}">Effacer</button>
          </div>
        `;
        break;
      case 'date':
        inputHtml = `<input type="date" id="input-${field.id}" class="form-input" ${field.required ? 'required' : ''}>`;
        break;
      case 'number':
        inputHtml = `<input type="number" id="input-${field.id}" class="form-input" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>`;
        break;
      case 'email':
        inputHtml = `<input type="email" id="input-${field.id}" class="form-input" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>`;
        break;
      case 'phone':
        inputHtml = `<input type="tel" id="input-${field.id}" class="form-input" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>`;
        break;
      case 'lookup':
        inputHtml = `
          <div class="lookup-container" style="position: relative;">
            <input type="text" id="input-${field.id}" class="form-input lookup-input" placeholder="${field.placeholder || 'Rechercher...'}" autocomplete="off" ${field.required ? 'required' : ''}>
            <input type="hidden" id="input-${field.id}-value">
            <div class="lookup-dropdown" id="dropdown-${field.id}" style="display: none; position: absolute; top: 100%; left: 0; right: 0; max-height: 200px; overflow-y: auto; background: white; border: 1px solid #e2e8f0; border-radius: 0 0 6px 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 100;"></div>
          </div>
        `;
        break;
      case 'calculated':
        inputHtml = `
          <div class="calculated-field" style="padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 1.1em; font-weight: 600; color: #1e293b;">
            <span id="input-${field.id}">0</span><span class="calc-suffix">${field.calcSuffix || ''}</span>
          </div>
        `;
        break;
      default:
        inputHtml = `<input type="text" id="input-${field.id}" class="form-input" placeholder="${field.placeholder || ''}" ${field.required ? 'required' : ''}>`;
    }
    
    // Appliquer le style selon la position du label et si le label est masqué
    if (field.hideLabel) {
      // Label masqué - afficher uniquement le champ
      group.innerHTML = `
        ${inputHtml}
        <div class="form-error" id="error-${field.id}"></div>
      `;
    } else if (field.labelPosition === 'left') {
      group.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <label class="form-label ${field.required ? 'required' : ''}" for="input-${field.id}" style="flex-shrink: 0; min-width: 80px; max-width: 40%; padding-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${field.label}</label>
          <div style="flex: 1;">
            ${inputHtml}
            <div class="form-error" id="error-${field.id}"></div>
          </div>
        </div>
      `;
    } else {
      group.innerHTML = `
        <label class="form-label ${field.required ? 'required' : ''}" for="input-${field.id}">${field.label}</label>
        ${inputHtml}
        <div class="form-error" id="error-${field.id}"></div>
      `;
    }
    
    formFieldsView.appendChild(group);
  });
  
  // Initialiser les signatures
  initSignatureCanvases();
  
  // Initialiser les lookups
  initLookupFields();
  
  // Initialiser les champs calculés
  initCalculatedFields();
  
  // Initialiser les conditions
  initConditions();
}

// Initialiser les champs calculés
function initCalculatedFields() {
  if (!formConfig || !formConfig.fields) return;
  
  const calculatedFields = formConfig.fields.filter(f => f.fieldType === 'calculated');
  if (calculatedFields.length === 0) return;
  
  // Fonction pour recalculer tous les champs calculés
  function recalculateAll() {
    calculatedFields.forEach(field => {
      const resultEl = document.getElementById(`input-${field.id}`);
      if (!resultEl) return;
      
      let valueA = 0;
      let valueB = 0;
      
      // Obtenir valeur A
      if (field.calcFieldA) {
        const inputA = document.getElementById(`input-${field.calcFieldA}`);
        if (inputA) valueA = parseFloat(inputA.value) || 0;
      }
      
      // Obtenir valeur B
      if (field.calcFieldB === '_constant') {
        valueB = field.calcConstant || 0;
      } else if (field.calcFieldB) {
        const inputB = document.getElementById(`input-${field.calcFieldB}`);
        if (inputB) valueB = parseFloat(inputB.value) || 0;
      }
      
      let result = 0;
      
      switch (field.calcType || 'sum') {
        case 'sum':
          result = valueA + valueB;
          break;
        case 'subtract':
          result = valueA - valueB;
          break;
        case 'multiply':
          result = valueA * valueB;
          break;
        case 'divide':
          result = valueB !== 0 ? valueA / valueB : 0;
          break;
        case 'percentage':
          result = valueA * (valueB / 100);
          break;
        case 'custom':
          try {
            const formula = (field.calcFormula || 'A + B')
              .replace(/A/gi, valueA)
              .replace(/B/gi, valueB);
            result = eval(formula);
          } catch (e) {
            result = 0;
          }
          break;
      }
      
      const decimals = field.calcDecimals !== undefined ? field.calcDecimals : 2;
      resultEl.textContent = result.toFixed(decimals);
    });
  }
  
  // Écouter les changements sur tous les champs numériques
  formConfig.fields.forEach(field => {
    if (field.fieldType === 'number') {
      const input = document.getElementById(`input-${field.id}`);
      if (input) {
        input.addEventListener('input', recalculateAll);
        input.addEventListener('change', recalculateAll);
      }
    }
  });
  
  // Calculer au chargement
  recalculateAll();
}

// Initialiser les champs Lookup avec autocomplétion
async function initLookupFields() {
  if (!formConfig || !formConfig.fields) return;
  
  for (const field of formConfig.fields) {
    if (field.fieldType !== 'lookup' || !field.lookupTable) continue;
    
    const input = document.getElementById(`input-${field.id}`);
    const hiddenInput = document.getElementById(`input-${field.id}-value`);
    const dropdown = document.getElementById(`dropdown-${field.id}`);
    
    if (!input || !dropdown) continue;
    
    // Charger les données si pas encore fait
    if (!field.lookupData) {
      try {
        const data = await grist.docApi.fetchTable(field.lookupTable);
        field.lookupData = data;
      } catch (error) {
        console.error('Erreur chargement lookup:', error);
        continue;
      }
    }
    
    const displayCol = field.lookupDisplayColumn || 'id';
    const valueCol = field.lookupValueColumn || 'id';
    
    // Préparer les options
    const options = [];
    if (field.lookupData && field.lookupData.id) {
      for (let i = 0; i < field.lookupData.id.length; i++) {
        options.push({
          display: field.lookupData[displayCol] ? field.lookupData[displayCol][i] : field.lookupData.id[i],
          value: field.lookupData[valueCol] ? field.lookupData[valueCol][i] : field.lookupData.id[i]
        });
      }
    }
    
    // Filtrer et afficher les résultats
    function filterOptions(query) {
      const filtered = options.filter(opt => 
        String(opt.display).toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10);
      
      if (filtered.length === 0 || query === '') {
        dropdown.style.display = 'none';
        return;
      }
      
      dropdown.innerHTML = filtered.map(opt => `
        <div class="lookup-option" data-value="${opt.value}" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid #f1f5f9;">
          ${opt.display}
        </div>
      `).join('');
      
      dropdown.style.display = 'block';
      
      // Ajouter les event listeners
      dropdown.querySelectorAll('.lookup-option').forEach(optEl => {
        optEl.addEventListener('mouseenter', () => optEl.style.background = '#eff6ff');
        optEl.addEventListener('mouseleave', () => optEl.style.background = 'white');
        optEl.addEventListener('click', () => {
          input.value = optEl.textContent.trim();
          if (hiddenInput) hiddenInput.value = optEl.dataset.value;
          dropdown.style.display = 'none';
        });
      });
    }
    
    input.addEventListener('input', (e) => filterOptions(e.target.value));
    input.addEventListener('focus', (e) => {
      if (e.target.value) filterOptions(e.target.value);
    });
    
    // Fermer le dropdown quand on clique ailleurs
    document.addEventListener('click', (e) => {
      if (!e.target.closest(`#input-${field.id}`) && !e.target.closest(`#dropdown-${field.id}`)) {
        dropdown.style.display = 'none';
      }
    });
  }
}

// Initialiser les canvas de signature
function initSignatureCanvases() {
  document.querySelectorAll('.signature-canvas').forEach(canvas => {
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;
    
    canvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    
    canvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      [lastX, lastY] = [e.offsetX, e.offsetY];
    });
    
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
  });
  
  document.querySelectorAll('.signature-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      const canvasId = btn.dataset.canvas;
      const canvas = document.getElementById(canvasId);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
  });
}

// Initialiser les conditions d'affichage
function initConditions() {
  if (!formConfig || !formConfig.fields) return;
  
  // Trouver tous les champs avec des conditions
  formConfig.fields.forEach(field => {
    if (!field.condition || !field.condition.fieldId) return;
    
    const group = document.querySelector(`.form-field-view[data-field-id="${field.id}"]`);
    if (!group) return;
    
    const sourceField = formConfig.fields.find(f => f.id === field.condition.fieldId);
    if (!sourceField) return;
    
    const sourceInput = document.getElementById(`input-${field.condition.fieldId}`);
    if (!sourceInput) return;
    
    function checkCondition() {
      let sourceValue = '';
      
      if (sourceField.fieldType === 'radio') {
        const checked = sourceInput.querySelector('input:checked');
        sourceValue = checked ? checked.value : '';
      } else if (sourceField.fieldType === 'checkbox') {
        const checked = sourceInput.querySelectorAll('input:checked');
        sourceValue = Array.from(checked).map(c => c.value).join(',');
      } else if (sourceField.fieldType === 'select') {
        sourceValue = sourceInput.value || '';
      } else {
        sourceValue = sourceInput.value || '';
      }
      
      let visible = false;
      const condValue = field.condition.value || '';
      
      switch (field.condition.operator) {
        case 'equals':
          visible = sourceValue === condValue;
          break;
        case 'not-equals':
          visible = sourceValue !== condValue;
          break;
        case 'contains':
          visible = sourceValue.toLowerCase().includes(condValue.toLowerCase());
          break;
        case 'not-empty':
          visible = sourceValue !== '';
          break;
        case 'empty':
          visible = sourceValue === '';
          break;
      }
      
      group.classList.toggle('hidden', !visible);
    }
    
    // Écouter les changements
    if (sourceField.fieldType === 'radio' || sourceField.fieldType === 'checkbox') {
      sourceInput.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', checkCondition);
      });
    } else {
      sourceInput.addEventListener('input', checkCondition);
      sourceInput.addEventListener('change', checkCondition);
    }
    
    // Vérifier au chargement
    checkCondition();
  });
}

// Soumettre le formulaire
async function submitForm() {
  // Vérifier les droits de soumission
  if (!canSubmit) {
    showToast('Vous n\'avez pas la permission de soumettre ce formulaire' + (userRole ? ' (rôle: ' + userRole + ')' : ''), 'error');
    return;
  }

  if (!formConfig || !formConfig.tableId) {
    showToast('Configuration invalide', 'error');
    return;
  }
  
  const record = {};
  let hasError = false;
  
  formConfig.fields.forEach(field => {
    if (field.fieldType === 'section') return;
    if (!field.columnId) return;
    
    const group = document.querySelector(`.form-field-view[data-field-id="${field.id}"]`);
    if (group && group.classList.contains('hidden')) return;
    
    const errorEl = document.getElementById(`error-${field.id}`);
    if (errorEl) errorEl.textContent = '';
    
    let value = null;
    
    if (field.fieldType === 'radio') {
      const container = document.getElementById(`input-${field.id}`);
      const checked = container?.querySelector('input:checked');
      value = checked ? checked.value : null;
    } else if (field.fieldType === 'checkbox') {
      const container = document.getElementById(`input-${field.id}`);
      const checked = container?.querySelectorAll('input:checked');
      value = checked ? Array.from(checked).map(c => c.value) : [];
    } else if (field.fieldType === 'signature') {
      const canvas = document.getElementById(`input-${field.id}`);
      if (canvas) {
        value = canvas.toDataURL();
      }
    } else {
      const input = document.getElementById(`input-${field.id}`);
      if (input) {
        if (field.fieldType === 'number') {
          value = input.value ? parseFloat(input.value) : null;
        } else {
          value = input.value || null;
        }
      }
    }
    
    // Validation obligatoire
    if (field.required) {
      const isEmpty = value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        if (errorEl) errorEl.textContent = 'Ce champ est obligatoire';
        hasError = true;
      }
    }
    
    // Validation min/max pour les nombres
    if (value !== null && field.fieldType === 'number') {
      if (field.minValue !== undefined && parseFloat(value) < field.minValue) {
        if (errorEl) errorEl.textContent = `Valeur minimum: ${field.minValue}`;
        hasError = true;
      }
      if (field.maxValue !== undefined && parseFloat(value) > field.maxValue) {
        if (errorEl) errorEl.textContent = `Valeur maximum: ${field.maxValue}`;
        hasError = true;
      }
    }
    
    // Validation longueur pour les textes
    if (value && typeof value === 'string') {
      if (field.minLength && value.length < field.minLength) {
        if (errorEl) errorEl.textContent = `Minimum ${field.minLength} caractères`;
        hasError = true;
      }
      if (field.maxLength && value.length > field.maxLength) {
        if (errorEl) errorEl.textContent = `Maximum ${field.maxLength} caractères`;
        hasError = true;
      }
    }
    
    // Validation regex/pattern
    if (value && field.pattern) {
      try {
        const regex = new RegExp(field.pattern);
        if (!regex.test(value)) {
          if (errorEl) errorEl.textContent = field.errorMessage || 'Format invalide';
          hasError = true;
        }
      } catch (e) {
        // Regex invalide, ignorer
      }
    }
    
    // Validation email
    if (value && field.fieldType === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        if (errorEl) errorEl.textContent = 'Email invalide';
        hasError = true;
      }
    }
    
    record[field.columnId] = Array.isArray(value) ? value.join(', ') : value;
  });
  
  if (hasError) {
    showToast('Veuillez corriger les erreurs', 'error');
    return;
  }
  
  try {
    showLoading();
    await grist.docApi.applyUserActions([
      ['AddRecord', formConfig.tableId, null, record]
    ]);
    hideLoading();
    showToast('Enregistrement ajouté avec succès', 'success');
    resetFormInputs();
  } catch (error) {
    hideLoading();
    console.error('Erreur soumission:', error);
    showToast('Erreur: ' + error.message, 'error');
  }
}

// Réinitialiser les champs
function resetFormInputs() {
  if (!formConfig || !formConfig.fields) return;
  
  formConfig.fields.forEach(field => {
    if (field.fieldType === 'section') return;
    
    const errorEl = document.getElementById(`error-${field.id}`);
    if (errorEl) errorEl.textContent = '';
    
    if (field.fieldType === 'radio' || field.fieldType === 'checkbox') {
      const container = document.getElementById(`input-${field.id}`);
      if (container) {
        container.querySelectorAll('input').forEach(input => input.checked = false);
      }
    } else if (field.fieldType === 'signature') {
      const canvas = document.getElementById(`input-${field.id}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    } else {
      const input = document.getElementById(`input-${field.id}`);
      if (input) input.value = '';
    }
  });
  
  // Réinitialiser les conditions
  initConditions();
}

// Export PDF
async function exportPdf() {
  if (formFields.length === 0) {
    showToast('Aucun formulaire à exporter', 'error');
    return;
  }
  
  showLoading();
  
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Capturer le canvas
    const canvas = await html2canvas(formCanvas, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth, imgHeight);
    pdf.save('formulaire.pdf');
    
    hideLoading();
    showToast('PDF exporté', 'success');
  } catch (error) {
    hideLoading();
    console.error('Erreur export PDF:', error);
    showToast('Erreur lors de l\'export PDF', 'error');
  }
}

// Templates
function openTemplatesModal() {
  renderTemplatesList();
  modalTemplates.classList.remove('hidden');
}

function closeTemplatesModal() {
  modalTemplates.classList.add('hidden');
}

function renderTemplatesList() {
  if (templates.length === 0) {
    templatesList.innerHTML = '<p style="color: #94a3b8; font-size: 0.85em; text-align: center; padding: 20px;">Aucun template</p>';
    return;
  }
  
  templatesList.innerHTML = templates.map((t, i) => `
    <div class="template-item" data-index="${i}" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
      <div style="cursor: pointer; flex: 1;" class="template-load">
        <div class="template-name">${t.name}</div>
        <div class="template-date">${t.date}</div>
      </div>
      <button class="template-overwrite" data-index="${i}" title="Écraser avec le formulaire actuel" style="background: #dbeafe; color: #2563eb; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8em;">💾</button>
      <button class="template-delete" data-index="${i}" title="Supprimer" style="background: #fee2e2; color: #dc2626; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 0.8em;">🗑️</button>
    </div>
  `).join('');
  
  templatesList.querySelectorAll('.template-load').forEach(item => {
    item.addEventListener('click', () => {
      const index = parseInt(item.parentElement.dataset.index);
      loadTemplate(index);
    });
  });
  
  templatesList.querySelectorAll('.template-overwrite').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const templateName = templates[index].name;
      
      if (formFields.length === 0) {
        showToast('Aucun champ à sauvegarder', 'error');
        return;
      }
      
      const confirmed = await showConfirm({
        icon: '💾',
        title: 'Écraser le template',
        message: `Écraser "${templateName}" avec le formulaire actuel ?`,
        confirmText: 'Écraser',
        cancelText: 'Annuler'
      });
      
      if (confirmed) {
        templates[index] = {
          name: templateName,
          date: new Date().toLocaleDateString('fr-FR'),
          fields: JSON.parse(JSON.stringify(formFields)),
          tableId: currentTable
        };
        saveFormConfig();
        closeTemplatesModal();
        showToast('Template "' + templateName + '" mis à jour', 'success');
      }
    });
  });
  
  templatesList.querySelectorAll('.template-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      const confirmed = await showConfirm({
        icon: '🗑️',
        title: 'Supprimer le template',
        message: `Supprimer "${templates[index].name}" ?`,
        confirmText: 'Supprimer',
        cancelText: 'Annuler'
      });
      if (confirmed) {
        templates.splice(index, 1);
        renderTemplatesList();
        saveFormConfig();
        showToast('Template supprimé', 'success');
      }
    });
  });
}

async function saveTemplate() {
  const name = templateNameInput.value.trim();
  if (!name) {
    showToast('Veuillez entrer un nom', 'error');
    return;
  }
  
  if (formFields.length === 0) {
    showToast('Aucun champ à sauvegarder', 'error');
    return;
  }
  
  // Vérifier si un template avec ce nom existe déjà
  const existingIndex = templates.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
  
  if (existingIndex >= 0) {
    // Demander confirmation pour écraser
    const confirmed = await showConfirm(
      `Le template "${name}" existe déjà. Voulez-vous le remplacer ?`,
      '📁',
      'Remplacer'
    );
    
    if (confirmed) {
      // Remplacer le template existant
      templates[existingIndex] = {
        name: name,
        date: new Date().toLocaleDateString('fr-FR'),
        fields: JSON.parse(JSON.stringify(formFields)),
        tableId: currentTable
      };
      showToast('Template mis à jour', 'success');
    } else {
      return;
    }
  } else {
    // Ajouter un nouveau template
    templates.push({
      name: name,
      date: new Date().toLocaleDateString('fr-FR'),
      fields: JSON.parse(JSON.stringify(formFields)),
      tableId: currentTable
    });
    showToast('Template sauvegardé', 'success');
  }
  
  templateNameInput.value = '';
  renderTemplatesList();
  saveFormConfig();
}

// Sauvegarder une version dans l'historique
function saveVersion(action = 'Modification') {
  if (formFields.length === 0) return;
  
  const now = new Date();
  versionHistory.unshift({
    action: action,
    date: now.toLocaleDateString('fr-FR'),
    time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    timestamp: now.getTime(),
    fields: JSON.parse(JSON.stringify(formFields)),
    tableId: currentTable,
    title: formConfig?.title || ''
  });
  
  // Garder max 20 versions
  if (versionHistory.length > 20) {
    versionHistory = versionHistory.slice(0, 20);
  }
  
  renderHistoryList();
}

// Afficher la liste de l'historique
function renderHistoryList() {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  
  if (versionHistory.length === 0) {
    historyList.innerHTML = '<p style="color: #94a3b8; font-size: 0.85em; text-align: center; padding: 20px;">Aucun historique</p>';
    return;
  }
  
  historyList.innerHTML = versionHistory.map((version, index) => `
    <div class="template-item" style="display: flex; justify-content: space-between; align-items: center;">
      <div>
        <div class="template-name">${version.action}</div>
        <div class="template-date">${version.date} à ${version.time} • ${version.fields.length} champs</div>
      </div>
      <button class="btn btn-secondary" onclick="restoreVersion(${index})" style="padding: 4px 10px; font-size: 0.75em;">↩️ Restaurer</button>
    </div>
  `).join('');
}

// Restaurer une version
async function restoreVersion(index) {
  const version = versionHistory[index];
  if (!version) return;
  
  const confirmed = await showConfirm({
    icon: '📜',
    title: 'Restaurer cette version',
    message: `Restaurer la version du ${version.date} à ${version.time} ?`,
    confirmText: 'Restaurer',
    cancelText: 'Annuler'
  });
  
  if (!confirmed) return;
  
  // Sauvegarder l'état actuel avant restauration
  saveVersion('Avant restauration');
  
  formFields = JSON.parse(JSON.stringify(version.fields));
  if (version.title) {
    formConfig.title = version.title;
    document.getElementById('form-title-input').value = version.title;
  }
  
  renderFormFields();
  showToast('Version restaurée', 'success');
}

async function loadTemplate(index) {
  const template = templates[index];
  if (!template) return;
  
  if (formFields.length > 0) {
    const confirmed = await showConfirm({
      icon: '📄',
      title: 'Charger le template',
      message: 'Cela remplacera le formulaire actuel. Continuer ?',
      confirmText: 'Charger',
      cancelText: 'Annuler'
    });
    if (!confirmed) return;
  }
  
  formFields = JSON.parse(JSON.stringify(template.fields));
  if (template.tableId) {
    tableSelect.value = template.tableId;
    currentTable = template.tableId;
    loadTableColumns(template.tableId);
  }
  
  renderFormFields();
  closeTemplatesModal();
  showToast('Template chargé', 'success');
}

// Utilitaires
function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = 'toast ' + type + ' show';
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

// Modal de confirmation personnalisée
let confirmResolve = null;
const modalConfirm = document.getElementById('modal-confirm');
const confirmIcon = document.getElementById('confirm-icon');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const btnConfirmOk = document.getElementById('btn-confirm-ok');
const btnConfirmCancel = document.getElementById('btn-confirm-cancel');

function showConfirm(options = {}) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmIcon.textContent = options.icon || '⚠️';
    confirmTitle.textContent = options.title || 'Confirmation';
    confirmMessage.textContent = options.message || 'Êtes-vous sûr ?';
    btnConfirmOk.textContent = options.confirmText || 'Confirmer';
    btnConfirmCancel.textContent = options.cancelText || 'Annuler';
    
    if (options.danger) {
      btnConfirmOk.classList.add('danger');
    } else {
      btnConfirmOk.classList.remove('danger');
    }
    
    modalConfirm.classList.remove('hidden');
  });
}

function closeConfirm(result) {
  modalConfirm.classList.add('hidden');
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

btnConfirmOk.addEventListener('click', () => closeConfirm(true));
btnConfirmCancel.addEventListener('click', () => closeConfirm(false));
modalConfirm.addEventListener('click', (e) => {
  if (e.target === modalConfirm) closeConfirm(false);
});

// Event listeners
tableSelect.addEventListener('change', (e) => loadTableColumns(e.target.value));

btnModeEdit.addEventListener('click', () => switchMode('edit'));
btnModeFill.addEventListener('click', () => switchMode('fill'));
document.getElementById('btn-mode-guide')?.addEventListener('click', () => switchMode('guide'));
btnSave.addEventListener('click', saveFormConfig);
document.getElementById('btn-new-form')?.addEventListener('click', newForm);
btnClear.addEventListener('click', clearForm);
btnSubmit.addEventListener('click', submitForm);
btnResetForm.addEventListener('click', resetFormInputs);
btnExportPdf.addEventListener('click', exportPdf);

// Partager le formulaire
document.getElementById('btn-share-form')?.addEventListener('click', async () => {
  if (formFields.length === 0) {
    showToast('Aucun formulaire à partager', 'error');
    return;
  }
  
  if (!currentTable) {
    showToast('Veuillez sélectionner une table', 'error');
    return;
  }
  
  // Sauvegarder d'abord la configuration
  await saveFormConfig();
  
  // Générer l'URL du formulaire public avec le paramètre table
  const baseUrl = window.location.href.split('?')[0];
  const formUrl = `${baseUrl}?mode=form&table=${encodeURIComponent(currentTable)}`;
  
  // Afficher la modale de partage
  const shareModal = document.getElementById('modal-share');
  const shareUrlInput = document.getElementById('share-url');
  
  if (shareModal && shareUrlInput) {
    shareUrlInput.value = formUrl;
    shareModal.classList.remove('hidden');
  }
});

// Copier l'URL de partage
document.getElementById('btn-copy-url')?.addEventListener('click', async () => {
  const shareUrlInput = document.getElementById('share-url');
  if (shareUrlInput) {
    try {
      await navigator.clipboard.writeText(shareUrlInput.value);
      const btn = document.getElementById('btn-copy-url');
      btn.innerHTML = '✅ Copié !';
      btn.style.background = '#10b981';
      setTimeout(() => {
        btn.innerHTML = '📋 Copier';
        btn.style.background = '';
      }, 2000);
    } catch (e) {
      shareUrlInput.select();
      document.execCommand('copy');
      showToast('Lien copié !', 'success');
    }
  }
});

// Fermer la modale de partage
document.getElementById('btn-close-share')?.addEventListener('click', () => {
  document.getElementById('modal-share')?.classList.add('hidden');
});

// Fermer la modale en cliquant sur l'overlay
document.getElementById('modal-share')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-share') {
    e.target.classList.add('hidden');
  }
});

btnTemplates.addEventListener('click', openTemplatesModal);
btnSaveTemplate.addEventListener('click', saveTemplate);
btnCloseTemplates.addEventListener('click', closeTemplatesModal);

// Onglets Templates / Historique
document.getElementById('btn-show-templates')?.addEventListener('click', () => {
  document.getElementById('templates-tab').style.display = '';
  document.getElementById('history-tab').style.display = 'none';
  document.getElementById('btn-show-templates').classList.add('active');
  document.getElementById('btn-show-history').classList.remove('active');
});

document.getElementById('btn-show-history')?.addEventListener('click', () => {
  document.getElementById('templates-tab').style.display = 'none';
  document.getElementById('history-tab').style.display = '';
  document.getElementById('btn-show-templates').classList.remove('active');
  document.getElementById('btn-show-history').classList.add('active');
  renderHistoryList();
});

// Export template JSON
btnExportTemplate.addEventListener('click', () => {
  const templateData = {
    name: formConfig.title || 'Mon formulaire',
    version: '1.0',
    exportDate: new Date().toISOString(),
    fields: formFields,
    config: {
      title: formConfig.title,
      tableId: selectedTableId
    }
  };
  
  const jsonStr = JSON.stringify(templateData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `${formConfig.title || 'template'}_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('Template exporté !', 'success');
});

// Import template JSON
btnImportTemplate.addEventListener('click', () => {
  importFile.click();
});

importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const templateData = JSON.parse(event.target.result);
      
      if (!templateData.fields || !Array.isArray(templateData.fields)) {
        showToast('Format de template invalide', 'error');
        return;
      }
      
      formFields = templateData.fields;
      if (templateData.config) {
        formConfig.title = templateData.config.title || '';
        document.getElementById('form-title-input').value = formConfig.title;
      }
      
      renderFormFields();
      showToast(`Template "${templateData.name}" importé !`, 'success');
      closeTemplatesModal();
    } catch (err) {
      showToast('Erreur lors de l\'import: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  
  // Reset input pour permettre de réimporter le même fichier
  importFile.value = '';
});

// Grille et snap
btnGrid.addEventListener('click', () => {
  showGrid = !showGrid;
  formCanvas.classList.toggle('show-grid', showGrid);
  btnGrid.classList.toggle('active', showGrid);
});

btnSnap.addEventListener('click', () => {
  snapToGrid = !snapToGrid;
  btnSnap.classList.toggle('active', snapToGrid);
});

// Zoom
btnZoomIn.addEventListener('click', () => {
  if (zoomLevel < 150) {
    zoomLevel += 10;
    formCanvas.style.transform = `scale(${zoomLevel / 100})`;
    document.getElementById('zoom-level').textContent = zoomLevel + '%';
  }
});

btnZoomOut.addEventListener('click', () => {
  if (zoomLevel > 50) {
    zoomLevel -= 10;
    formCanvas.style.transform = `scale(${zoomLevel / 100})`;
    document.getElementById('zoom-level').textContent = zoomLevel + '%';
  }
});

// Zoom fit to screen
btnZoomFit.addEventListener('click', () => {
  const workspaceRect = workspace.getBoundingClientRect();
  const pageWidth = 210 * 3.78; // 210mm en pixels (1mm ≈ 3.78px)
  const pageHeight = 297 * 3.78; // 297mm en pixels
  
  // Calculer le zoom pour que la page tienne dans l'espace disponible
  const availableWidth = workspaceRect.width - 80; // Marge
  const availableHeight = workspaceRect.height - 80;
  
  const scaleX = availableWidth / pageWidth;
  const scaleY = availableHeight / pageHeight;
  const fitScale = Math.min(scaleX, scaleY);
  
  // Arrondir à 10% près
  zoomLevel = Math.round(fitScale * 100 / 10) * 10;
  zoomLevel = Math.max(50, Math.min(150, zoomLevel)); // Limiter entre 50% et 150%
  
  formCanvas.style.transform = `scale(${zoomLevel / 100})`;
  document.getElementById('zoom-level').textContent = zoomLevel + '%';
  
  // Mettre à jour les règles si elles sont affichées
  if (showRulers) {
    generateRulerMarks();
  }
});

// Gestion des pages
document.getElementById('btn-prev-page')?.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    updatePageIndicator();
    renderFormFields();
  }
});

document.getElementById('btn-next-page')?.addEventListener('click', () => {
  if (currentPage < totalPages) {
    currentPage++;
    updatePageIndicator();
    renderFormFields();
  }
});

document.getElementById('btn-add-page')?.addEventListener('click', () => {
  totalPages++;
  currentPage = totalPages;
  updatePageIndicator();
  renderFormFields();
  showToast(`Page ${totalPages} ajoutée`, 'success');
});

function updatePageIndicator() {
  const indicator = document.getElementById('page-indicator');
  if (indicator) {
    indicator.textContent = `${currentPage} / ${totalPages}`;
  }
}

// Toggle panneaux latéraux
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
  // Recalculer les règles après la transition
  if (showRulers) {
    setTimeout(generateRulerMarks, 350);
  }
});

propertiesToggle.addEventListener('click', () => {
  propertiesPanel.classList.toggle('collapsed');
  // Recalculer les règles après la transition
  if (showRulers) {
    setTimeout(generateRulerMarks, 350);
  }
});

// Tabs sidebar
sidebarTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    sidebarTabs.forEach(t => t.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

// Clic en dehors pour désélectionner
formCanvas.addEventListener('click', (e) => {
  if (e.target === formCanvas || e.target === emptyMessage || e.target.closest('.empty-message')) {
    const oldSelected = formCanvas.querySelector('.form-field.selected, .form-section.selected, .form-image.selected, .form-title-element.selected, .form-qrcode.selected, .form-divider.selected');
    if (oldSelected) oldSelected.classList.remove('selected');
    selectedField = null;
    renderPropertiesPanel();
  }
});

// Fermer modal en cliquant dehors
modalTemplates.addEventListener('click', (e) => {
  if (e.target === modalTemplates) closeTemplatesModal();
});

// Initialiser snap comme actif
btnSnap.classList.add('active');

// Règles (rulers)
const btnRulers = document.getElementById('btn-rulers');
const rulerH = document.getElementById('ruler-h');
const rulerV = document.getElementById('ruler-v');
const rulerCorner = document.getElementById('ruler-corner');
const workspace = document.getElementById('workspace');
let showRulers = false;

function generateRulerMarks() {
  const rulerHMarks = document.getElementById('ruler-h-marks');
  const rulerVMarks = document.getElementById('ruler-v-marks');
  
  // Obtenir la position de la page A4 par rapport au workspace
  const pageRect = formCanvas.getBoundingClientRect();
  const workspaceRect = workspace.getBoundingClientRect();
  const rulerHRect = document.getElementById('ruler-h').getBoundingClientRect();
  const rulerVRect = document.getElementById('ruler-v').getBoundingClientRect();
  
  // Calculer l'offset pour que le 0 soit à l'angle de la page
  const offsetX = pageRect.left - rulerHRect.left;
  const offsetY = pageRect.top - rulerVRect.top;
  
  // A4 = 21cm x 29.7cm, 1cm = 37.8px
  const cmToPx = 37.8;
  
  // Règle horizontale (21 cm)
  let hHtml = '';
  for (let i = 0; i <= 21; i++) {
    hHtml += `<div class="ruler-mark" style="left: ${offsetX + i * cmToPx}px;">${i}</div>`;
  }
  rulerHMarks.innerHTML = hHtml;
  
  // Règle verticale (30 cm pour couvrir la page A4 de 29.7cm)
  let vHtml = '';
  for (let i = 0; i <= 30; i++) {
    vHtml += `<div class="ruler-mark" style="top: ${offsetY + i * cmToPx}px;">${i}</div>`;
  }
  rulerVMarks.innerHTML = vHtml;
}

btnRulers.addEventListener('click', () => {
  showRulers = !showRulers;
  btnRulers.classList.toggle('active', showRulers);
  rulerH.classList.toggle('show', showRulers);
  rulerV.classList.toggle('show', showRulers);
  rulerCorner.classList.toggle('show', showRulers);
  workspace.classList.toggle('with-rulers', showRulers);
  
  if (showRulers) {
    setTimeout(generateRulerMarks, 50); // Attendre que le layout soit mis à jour
  }
});

// Mettre à jour les règles lors du scroll
workspace.addEventListener('scroll', () => {
  if (showRulers) {
    generateRulerMarks();
  }
});

// Mettre à jour les règles lors du redimensionnement de la fenêtre
window.addEventListener('resize', () => {
  if (showRulers) {
    generateRulerMarks();
  }
});

// === Gestion de l'onglet Rôles ===

// Peupler les dropdowns de l'onglet Rôles
async function populateRolesTab() {
  const rolesTableSelect = document.getElementById('roles-table-select');
  const rolesEmailCol = document.getElementById('roles-email-column');
  const rolesRoleCol = document.getElementById('roles-role-column');
  const rolesAllowed = document.getElementById('roles-allowed');
  const rolesStatus = document.getElementById('roles-status');

  if (!rolesTableSelect) return;

  // Peupler la liste des tables
  rolesTableSelect.innerHTML = '<option value="">-- Aucune restriction --</option>';
  availableTables.forEach(function(t) {
    var opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    if (formConfig && formConfig.rolesTable === t) opt.selected = true;
    rolesTableSelect.appendChild(opt);
  });

  // Pré-remplir les rôles autorisés
  if (formConfig && formConfig.allowedRoles && formConfig.allowedRoles.length > 0) {
    rolesAllowed.value = formConfig.allowedRoles.join(', ');
  }

  // Si une table est déjà sélectionnée, charger ses colonnes
  if (formConfig && formConfig.rolesTable) {
    await loadRolesColumns(formConfig.rolesTable);
  }

  // Afficher le statut actuel
  updateRolesStatus();
}

// Charger les colonnes d'une table pour les dropdowns email/rôle
async function loadRolesColumns(tableId) {
  var rolesEmailCol = document.getElementById('roles-email-column');
  var rolesRoleCol = document.getElementById('roles-role-column');

  if (!tableId) {
    rolesEmailCol.innerHTML = '<option value="">--</option>';
    rolesRoleCol.innerHTML = '<option value="">--</option>';
    return;
  }

  try {
    var data = await grist.docApi.fetchTable(tableId);
    var columns = Object.keys(data).filter(function(col) {
      return col !== 'id' && col !== 'manualSort' && !col.startsWith('grist');
    });

    rolesEmailCol.innerHTML = '<option value="">-- Sélectionner --</option>';
    rolesRoleCol.innerHTML = '<option value="">-- Sélectionner --</option>';

    columns.forEach(function(col) {
      var opt1 = document.createElement('option');
      opt1.value = col;
      opt1.textContent = col;
      if (formConfig && formConfig.rolesEmailColumn === col) opt1.selected = true;
      rolesEmailCol.appendChild(opt1);

      var opt2 = document.createElement('option');
      opt2.value = col;
      opt2.textContent = col;
      if (formConfig && formConfig.rolesRoleColumn === col) opt2.selected = true;
      rolesRoleCol.appendChild(opt2);
    });
  } catch (e) {
    console.log('[FormBuilder] Erreur chargement colonnes rôles:', e.message);
  }
}

// Mettre à jour le statut affiché
function updateRolesStatus() {
  var rolesStatus = document.getElementById('roles-status');
  if (!rolesStatus) return;

  if (formConfig && formConfig.rolesTable && formConfig.allowedRoles && formConfig.allowedRoles.length > 0) {
    rolesStatus.innerHTML = '<span style="color: #10b981;">✅ Restriction active</span><br>' +
      '<span style="color: #64748b;">Table: ' + formConfig.rolesTable + '</span><br>' +
      '<span style="color: #64748b;">Rôles autorisés: ' + formConfig.allowedRoles.join(', ') + '</span>';
    if (currentUserEmail) {
      rolesStatus.innerHTML += '<br><span style="color: #64748b;">Votre email: ' + currentUserEmail + '</span>';
      rolesStatus.innerHTML += '<br><span style="color: ' + (canSubmit ? '#10b981' : '#ef4444') + ';">' +
        (canSubmit ? '✅ Vous pouvez soumettre' : '🔒 Soumission bloquée') +
        (userRole ? ' (rôle: ' + userRole + ')' : '') + '</span>';
    }
  } else {
    rolesStatus.innerHTML = '<span style="color: #94a3b8;">Aucune restriction — tout le monde peut soumettre.</span>';
  }
}

// Event: changement de table dans l'onglet Rôles
document.getElementById('roles-table-select')?.addEventListener('change', function(e) {
  loadRolesColumns(e.target.value);
});

// Event: sauvegarder les restrictions de rôles
document.getElementById('btn-save-roles')?.addEventListener('click', async function() {
  var rolesTable = document.getElementById('roles-table-select').value;
  var rolesEmailColumn = document.getElementById('roles-email-column').value;
  var rolesRoleColumn = document.getElementById('roles-role-column').value;
  var rolesAllowedStr = document.getElementById('roles-allowed').value;

  var allowedRoles = rolesAllowedStr
    ? rolesAllowedStr.split(',').map(function(r) { return r.trim(); }).filter(Boolean)
    : [];

  // Valider la config
  if (rolesTable && (!rolesEmailColumn || !rolesRoleColumn)) {
    showToast('Veuillez sélectionner les colonnes Email et Rôle', 'error');
    return;
  }

  // Mettre à jour formConfig
  if (!formConfig) formConfig = {};
  formConfig.rolesTable = rolesTable;
  formConfig.rolesEmailColumn = rolesEmailColumn;
  formConfig.rolesRoleColumn = rolesRoleColumn;
  formConfig.allowedRoles = allowedRoles;

  // Sauvegarder la config complète
  await saveFormConfig();

  // Re-vérifier le rôle de l'utilisateur courant
  await checkUserRole();
  applyRoleRestrictions();
  updateRolesStatus();

  showToast('Restrictions de rôles enregistrées', 'success');
});

// Peupler l'onglet Rôles quand on clique dessus
document.querySelector('.sidebar-tab[data-tab="roles"]')?.addEventListener('click', function() {
  populateRolesTab();
});
