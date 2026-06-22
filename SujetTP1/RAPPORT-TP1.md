# TP1 - Rapport d'analyse : Reparer une image Docker cassee

## Niveau 1 - Analyse du Dockerfile

### Dockerfile original analyse

```dockerfile
FROM node:18

WORKDIR /app

ENV API_KEY=sk-prod-abc123xyz456
ENV DB_PASSWORD=supersecret123
ENV DB_HOST=prod-db.monapp.com

COPY . .

RUN npm install

RUN npm run build

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    vim \
    git \
    htop \
    net-tools

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### Tableau de diagnostic

| Ligne(s) | Probleme observe | Consequence en production | Correction envisagee |
|----------|-----------------|--------------------------|---------------------|
| 1 (`FROM node:18`) | Image complete Debian utilisee au lieu d'une image alpine | Image de ~900 MB, bien au-dela de la limite de 200 MB. Surface d'attaque elargie avec des centaines de paquets systeme inutiles. | Remplacer par `FROM node:18-alpine` (~130 MB) |
| 6-8 (`ENV API_KEY=...`, `ENV DB_PASSWORD=...`, `ENV DB_HOST=...`) | Secrets et informations sensibles codes en dur dans le Dockerfile via des instructions `ENV` | Les secrets sont graves dans les layers de l'image. N'importe qui ayant acces a l'image peut les lire avec `docker inspect` ou `docker history`. Fuite de credentials de production. | Supprimer ces trois lignes `ENV`. Les secrets doivent etre passes au runtime via `docker run -e` ou un fichier `.env`. |
| 11 (`COPY . .`) | Tout le projet est copie avant l'installation des dependances | Le cache Docker est invalide a chaque modification de n'importe quel fichier source. Cela force la reinstallation complete des dependances (`npm install`) a chaque build, meme si `package.json` n'a pas change. Builds lents. | Copier d'abord `package*.json`, executer `npm install`, puis copier le reste du code. |
| 15 (`RUN npm install`) | Installation avec `npm install` au lieu de `npm install --omit=dev` | Les devDependencies (ici `nodemon`) sont installees dans l'image de production. Cela alourdit l'image et ajoute des outils inutiles en production. | Utiliser `RUN npm install --omit=dev` pour n'installer que les dependances de production. |
| 19-25 (`RUN apt-get install ...`) | Installation de nombreux outils systeme non necessaires (curl, wget, vim, git, htop, net-tools) | Image considerablement alourdie. Surface d'attaque elargie : chaque outil supplementaire est un vecteur potentiel d'exploitation. Aucun de ces outils n'est necessaire au fonctionnement de l'application Node.js. | Supprimer entierement ce bloc `RUN apt-get`. Si un outil est ponctuellement necessaire pour le debug, utiliser `docker exec` sur un container temporaire. |
| Absent | Aucun fichier `.dockerignore` present dans le projet | Les dossiers `node_modules/`, `.env`, `.git/` et les logs sont envoyes dans le contexte de build Docker. Cela ralentit le build, alourdit l'image, et risque d'inclure des fichiers sensibles (`.env` avec de vrais secrets). | Creer un fichier `.dockerignore` excluant : `node_modules/`, `.env`, `.git/`, `*.log`, `dist/`, `*.docx` |
| Absent | Le container tourne en tant que `root` (aucune instruction `USER`) | Si un attaquant exploite une vulnerabilite de l'application, il obtient les droits root dans le container. Cela peut permettre une escalade de privileges vers le systeme hote dans certaines configurations. | Ajouter `USER node` avant l'instruction `CMD`. L'utilisateur `node` existe deja dans les images Node officielles. |

**Total : 7 problemes identifies.**

## Niveau 2 - Reparation

### Dockerfile corrige

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000

CMD ["node", "index.js"]
```

### Corrections appliquees

1. `FROM node:18-alpine` : image legere (~130 MB au lieu de ~900 MB).
2. Suppression des trois `ENV` contenant des secrets (`API_KEY`, `DB_PASSWORD`, `DB_HOST`).
3. `COPY package*.json ./` puis `RUN npm install` avant `COPY . .` : le cache Docker est exploite correctement.
4. `npm install --omit=dev` : seules les dependances de production sont installees.
5. Suppression du bloc `apt-get install` : aucun outil inutile dans l'image.
6. Suppression de `RUN npm run build` : l'application fonctionne directement avec `index.js`.
7. `USER node` : le container ne tourne plus en root.
8. `RUN mkdir -p /app/data && chown node:node /app/data` : le dossier de donnees est cree avec les permissions de l'utilisateur `node`.

### Fichier .dockerignore cree

```
node_modules/
.env
*.log
.git/
dist/
*.docx
```

## Verification

### Build de l'image

```
PS> docker build -t tp1:corrige .
```

Sortie attendue : le build se termine sans erreur avec le message `=> exporting to image`.

### Taille de l'image

```
PS> docker images tp1:corrige
```

Sortie attendue :

```
REPOSITORY   TAG       IMAGE ID       CREATED          SIZE
tp1          corrige   xxxxxxxxxxxx   xx seconds ago   <200 MB
```

L'image fait moins de 200 MB (environ 130 MB).

### Lancement de l'application

```
PS> docker run --rm -p 3000:3000 tp1:corrige
```

Sortie attendue :

```
Serveur demarre sur le port 3000
```

Ouvrir http://localhost:3000 dans le navigateur : la page s'affiche avec le formulaire de messages.

### Verification de l'utilisateur non-root

```
PS> docker run --rm tp1:corrige whoami
```

Sortie attendue :

```
node
```

### Verification de l'absence de secrets

```
PS> docker inspect tp1:corrige --format "{{range .Config.Env}}{{println .}}{{end}}"
```

Sortie attendue : seules les variables systeme Node.js apparaissent (`PATH`, `NODE_VERSION`, etc.). Aucune ligne contenant `API_KEY`, `DB_PASSWORD` ou `DB_HOST`.
