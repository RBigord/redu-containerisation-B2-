# TP3 - Rapport : Conteneurisation de TaskFlow

## Contexte

TaskFlow est une application de gestion de taches composee de 3 services :
- **frontend** : interface web statique servie par Nginx
- **backend** : API REST Node.js (gestion des taches)
- **cache** : Redis pour le stockage et la persistance des taches

L'objectif est de conteneuriser l'application pour qu'une personne qui clone le repo puisse lancer toute la stack avec `docker compose up --build`.

## Structure du projet

```
SujetTP3/
├── backend/
│   ├── Dockerfile        # Image Docker du backend Node.js
│   ├── server.js         # API REST TaskFlow
│   └── package.json      # Dependances Node.js
├── frontend/
│   ├── Dockerfile        # Image Nginx du frontend
│   └── index.html        # Interface web TaskFlow
├── docker-compose.yml    # Services frontend, backend, cache
├── .env.example          # Template des variables d'environnement
├── .dockerignore         # Fichiers exclus du contexte Docker
└── RAPPORT-TP3.md        # Ce rapport
```

## Etape 1 - Dockerfile backend

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3001

CMD ["npm", "start"]
```

### Choix techniques

- **node:20-alpine** : image legere (~130 MB) comme demande dans le sujet.
- **COPY package*.json avant COPY . .** : exploite le cache Docker. Les dependances ne sont reinstallees que si `package.json` change.
- **EXPOSE 3001** : le backend ecoute sur le port 3001.
- **npm start** : lance `node server.js` tel que defini dans `package.json`.
- Aucun secret, aucun `node_modules`, aucun outil systeme inutile.

## Etape 2 - Dockerfile frontend

```dockerfile
FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html

EXPOSE 80
```

### Choix techniques

- **nginx:alpine** : image legere pour servir les fichiers statiques.
- Le fichier `index.html` est copie dans le dossier par defaut de Nginx.
- Pas de configuration Nginx personnalisee necessaire (le projet n'en fournit pas).

## Etape 3 - docker-compose.yml

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "${FRONTEND_PORT:-8080}:80"
    depends_on:
      - backend
    networks:
      - taskflow-net

  backend:
    build: ./backend
    ports:
      - "${BACKEND_PORT:-3001}:3001"
    environment:
      BACKEND_PORT: 3001
      REDIS_HOST: cache
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:-}
    depends_on:
      - cache
    restart: on-failure
    networks:
      - taskflow-net

  cache:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - taskflow-net

volumes:
  redis_data:

networks:
  taskflow-net:
```

### Choix techniques

- **3 services** : `frontend`, `backend`, `cache` comme demande.
- **cache (Redis)** : aucun `ports:` publie. Redis n'est accessible que par le backend via le nom de service `cache` sur le reseau Docker interne.
- **backend** : recoit `REDIS_HOST=cache` et `REDIS_PORT=6379` pour joindre Redis. `restart: on-failure` stabilise le demarrage si Redis n'est pas encore pret.
- **frontend** : publie sur le port 8080 de la machine hote.
- **Volume nomme `redis_data`** : les donnees Redis persistent apres un `docker compose down`.
- **Reseau `taskflow-net`** : tous les services partagent un reseau Docker commun.
- **Variables configurables** : les ports viennent du fichier `.env` avec des valeurs par defaut.

## Etape 4 - .env.example et .dockerignore

### .env.example

```
APP_ENV=local
BACKEND_PORT=3001
FRONTEND_PORT=8080
REDIS_HOST=cache
REDIS_PORT=6379
REDIS_PASSWORD=change-me-if-needed
```

Aucune vraie valeur sensible. Sert de modele pour creer un fichier `.env` local.

### .dockerignore

```
node_modules/
.env
*.log
.git/
dist/
build/
```

Empeche l'envoi de fichiers inutiles ou sensibles dans le contexte de build Docker.

## Guide de verification

### 1. Lancer la stack

```
cd SujetTP3
docker compose up --build
```

Sortie attendue : les 3 services demarrent. Les logs affichent `TaskFlow API demarree sur le port 3001` et `Connecte a Redis`.

### 2. Verifier que les 3 services tournent

```
PS> docker compose ps
```

Sortie attendue : les 3 services (frontend, backend, cache) sont en statut `Up`.

### 3. Tester le frontend

Ouvrir http://localhost:8080 dans le navigateur.

Sortie attendue : la page TaskFlow s'affiche avec le formulaire d'ajout de taches et les compteurs (Total, Terminees, En cours).

### 4. Tester le backend

Ouvrir http://localhost:3001/health dans le navigateur.

Sortie attendue :
```json
{"status":"ok","redis":"connected"}
```

### 5. Tester l'application

Depuis le frontend (http://localhost:8080) :
1. Taper "Ma premiere tache" et cliquer "Ajouter" → la tache apparait dans la liste
2. Cliquer "Terminer" sur la tache → elle est barree
3. Cliquer "Supprimer" → elle disparait

Les compteurs Total / Terminees / En cours se mettent a jour automatiquement.

### 6. Verifier que Redis n'est pas expose

Dans le `docker-compose.yml`, le service `cache` n'a aucun `ports:`. Redis n'est pas accessible depuis localhost.

Verification :
```
PS> Test-NetConnection -ComputerName localhost -Port 6379
```

Sortie attendue : `TcpTestSucceeded : False`.

### 7. Tester la persistance des donnees

```
PS> docker compose down
PS> docker compose up -d
```

Ouvrir http://localhost:8080.

Sortie attendue : les taches ajoutees precedemment sont toujours affichees. Les donnees ont survecu au redemarrage grace au volume `redis_data`.

Note : Redis doit etre configure pour persister ses donnees sur disque (RDB snapshots). L'image `redis:7-alpine` le fait par defaut.

### 8. Verifier l'absence de secrets en dur

```
PS> Select-String -Path docker-compose.yml -Pattern "password" -CaseSensitive:$false
```

Sortie attendue : seule la reference `${REDIS_PASSWORD:-}` apparait, jamais de vraie valeur.

## Criteres de reussite

| Critere | Resultat |
|---------|----------|
| Commande unique | `docker compose up --build` lance la stack depuis la racine |
| Frontend | http://localhost:8080 affiche l'interface TaskFlow |
| Backend | http://localhost:3001/health repond `{"status":"ok","redis":"connected"}` |
| Cache interne | Redis n'est pas expose sur localhost, seul le backend l'utilise |
| Persistance | Un volume nomme `redis_data` est declare pour Redis |
| Configuration | `.env.example` present, pas de secret en dur dans `docker-compose.yml` |
| Contexte Docker | `.dockerignore` present et coherent |
