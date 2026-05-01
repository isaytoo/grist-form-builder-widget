# Tables d'exemple pour tester les sélecteurs en cascade

Trois CSV à importer dans ton document Grist pour tester la nouvelle fonctionnalité.

## Import dans Grist

Pour chaque fichier :
1. Dans Grist, clique sur **Ajouter une table** (icône `+` dans la barre latérale)
2. Choisis **Importer un fichier**
3. Sélectionne le `.csv`
4. Confirme le nom de table proposé (`Departements`, `Villes`, `Produits`)

## Cas 1 — Département → Ville (opérateur `=`)

**Tables nécessaires** : `Departements` + `Villes`

**Configuration du formulaire** :

1. **Champ "Département"** (select) :
   - Source des options : 🔗 Depuis Grist
   - Table : `Departements`
   - Colonne libellé : `nom`
   - Colonne valeur : `code`
   - Pas de filtre (montre tous les départements)

2. **Champ "Ville"** (select) :
   - Source des options : 🔗 Depuis Grist
   - Table : `Villes`
   - Colonne libellé : `nom`
   - Colonne valeur : `nom`
   - Filtre : Champ parent = `Département`, Opérateur = `=`, Colonne source = `code_dept`

**Test** : sélectionne `Rhône` → le select Ville n'affiche plus que Lyon, Bron, Villeurbanne, Vénissieux.

## Cas 2 — Âge → Produits par tranche (opérateur `entre`)

**Table nécessaire** : `Produits`

**Configuration du formulaire** :

1. **Champ "Âge"** (number, statique — pas de source Grist) : zone de saisie numérique simple.

2. **Champ "Produits recommandés"** (select) :
   - Source des options : 🔗 Depuis Grist
   - Table : `Produits`
   - Colonne libellé : `nom`
   - Colonne valeur : `nom`
   - Filtre : Champ parent = `Âge`, Opérateur = `entre deux colonnes`, Colonne min = `age_min`, Colonne max = `age_max`

**Test** :
- Saisis `5` → propose Sucette anti-douleur, Tricycle, Vélo 16 pouces
- Saisis `12` → propose Trottinette, Skateboard, Console portable, Tablette
- Saisis `65` → propose Vélo VTT adulte, Carte senior SNCF, Mutuelle senior

## Cas 3 — Cascade à 3 niveaux : Département → Ville → Produits par catégorie

(Optionnel, pour tester la cascade transitive)

Ajoute une colonne `categorie_preferee` dans la table `Villes` (texte) avec quelques valeurs au choix (`Bébé`, `Enfant`, `Ado`...). Configure ensuite un troisième select :

3. **Champ "Suggestion produit"** (select) :
   - Table : `Produits`
   - Colonne libellé : `nom`
   - Filtre 1 : Champ parent = `Ville`, Opérateur = `=`, Colonne source = `categorie_preferee`... (ce filtre nécessite plutôt de filtrer Produits par catégorie)
   
**Plus simple à tester** : ajoute deux filtres au champ Produits :
- Filtre 1 : `Âge` entre `age_min` et `age_max`
- Filtre 2 : `Catégorie` (autre champ select) `=` `categorie`

Cela vérifie que les filtres se combinent en ET.
