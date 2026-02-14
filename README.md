# Grist Form Builder Pro Widget

> **Author:** Said Hamadou
> **License:** Apache-2.0

---

*[English](#english) | [Français](#français)*

---

<a id="english"></a>

## 🇬🇧 English

Visual drag-and-drop form builder for Grist. Design custom forms, preview them, and submit data directly into your Grist tables.

**Widget URL:** `https://grist-form-builder-widget.vercel.app/index.html`

### 🚀 Quick Start

1. In Grist, click **"Add widget to page"**
2. Select **"Custom"** as the widget type
3. Enter the custom widget URL:
   ```
   https://grist-form-builder-widget.vercel.app/index.html
   ```
4. Set the access level to **"Full document access"**
5. Done! Start building your forms.

### 📋 Features

- **Drag & drop form builder** with visual canvas
- **Field types**: text, number, date, select, checkbox, textarea, email, phone, etc.
- **Two modes**: Editor (design) and Fill (submit data)
- **Form templates**: Save and reuse form layouts
- **Grid snapping** for precise field placement
- **Zoom controls** for large forms
- **Live preview** before submission
- **Direct submission** to Grist tables
- **Bilingual interface** (French / English)

### 🔒 Security

- XSS protection on all user inputs
- Identifier sanitization for Grist compatibility
- Input validation before submission

### 🛠️ Local Development

```bash
git clone https://github.com/isaytoo/grist-form-builder-widget.git
cd grist-form-builder-widget
python3 -m http.server 8585
```

Then in Grist, use: `http://localhost:8585/index.html`

### ⚙️ Required Configuration

The widget requires **Full document access** to:
- List available tables and columns
- Read form configurations
- Write submitted form data

### 📁 File Structure

```
grist-form-builder-widget/
├── index.html       # Widget UI (HTML + CSS)
├── widget.js        # JavaScript logic (form builder, i18n)
├── .gitignore
└── README.md
```

---

<a id="français"></a>

## 🇫🇷 Français

Constructeur de formulaires visuel par glisser-déposer pour Grist. Concevez des formulaires personnalisés, prévisualisez-les et soumettez les données directement dans vos tables Grist.

**URL du widget :** `https://grist-form-builder-widget.vercel.app/index.html`

### 🚀 Utilisation rapide

1. Dans Grist, cliquez sur **"Ajouter un widget à la page"**
2. Sélectionnez **"Personnalisé"** comme type de widget
3. Entrez l'URL :
   ```
   https://grist-form-builder-widget.vercel.app/index.html
   ```
4. Définissez le niveau d'accès sur **"Full document access"**
5. C'est prêt ! Commencez à construire vos formulaires.

### 📋 Fonctionnalités

- **Constructeur drag & drop** avec canvas visuel
- **Types de champs** : texte, nombre, date, sélection, case à cocher, zone de texte, email, téléphone, etc.
- **Deux modes** : Éditeur (conception) et Remplissage (soumission)
- **Templates de formulaires** : sauvegardez et réutilisez vos mises en page
- **Accrochage à la grille** pour un placement précis
- **Contrôles de zoom** pour les grands formulaires
- **Aperçu en direct** avant soumission
- **Soumission directe** dans les tables Grist
- **Interface bilingue** (Français / Anglais)

### 🔒 Sécurité

- Protection XSS sur toutes les entrées utilisateur
- Sanitization des identifiants pour compatibilité Grist
- Validation des entrées avant soumission

### 🛠️ Développement local

```bash
git clone https://github.com/isaytoo/grist-form-builder-widget.git
cd grist-form-builder-widget
python3 -m http.server 8585
```

Puis dans Grist, utilisez : `http://localhost:8585/index.html`

### ⚙️ Configuration requise

Le widget nécessite un **accès complet au document** pour :
- Lister les tables et colonnes disponibles
- Lire les configurations de formulaires
- Écrire les données soumises

### 📁 Structure des fichiers

```
grist-form-builder-widget/
├── index.html       # Interface HTML + CSS du widget
├── widget.js        # Logique JavaScript (form builder, i18n)
├── .gitignore
└── README.md
```

---

## 🔗 Resources / Ressources

- [Grist Custom Widgets Documentation](https://support.getgrist.com/widget-custom/)
- [Grist Plugin API](https://support.getgrist.com/code/modules/grist_plugin_api/)
- [GristUp Widget Marketplace](https://www.gristup.fr)
