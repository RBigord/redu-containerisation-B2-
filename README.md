# Rendu Containerisation B2 - Docker & Docker Compose

**Matiere** : DevOps - Bachelor 3 Developpement 2025/2026

**Auteur** : Raphael Bigord

---

## Sommaire

- [TP1 - Reparer une image Docker cassee](#tp1---reparer-une-image-docker-cassee)
- [TP2 - Docker Compose : stack multi-services](#tp2---docker-compose--stack-multi-services)
- [TP3 - Conteneurisation de TaskFlow](#tp3---conteneurisation-de-taskflow)

---

## TP1 - Reparer une image Docker cassee

**Theme** : Dockerfile, layers, securite simple, bonnes pratiques de build

**Dossier** : `SujetTP1/`

### Contexte

Un Dockerfile fourni par un developpeur junior permettait de builder et lancer une application Node.js, mais contenait de nombreux problemes inacceptables pour une utilisation en production. La mission etait d'identifier les problemes, expliquer leurs consequences, puis corriger l'image.

### Problemes identifies (7)

| # | Probleme | Consequence |
|---|----------|-------------|
| 1 | `FROM node:18` — image complete Debian (~900 MB) | Image trop lourde, surface d'attaque elargie |
| 2 | Secrets en dur via `ENV` (API_KEY, DB_PASSWORD, DB_HOST) | Credentials visibles avec `docker inspect` |
| 3 | `COPY . .` avant `npm install` | Cache Docker invalide a chaque modif de code |
| 4 | `npm install` sans `--omit=dev` | devDependencies installees en production |
| 5 | Installation d'outils inutiles (curl, vim, git, htop...) | Image gonflée, surface d'attaque elargie |
| 6 | Pas de `.dockerignore` | node_modules, .env, .git envoyes dans le build |
| 7 | Container en root (pas de `USER`) | Risque d'escalade de privileges |

### Corrections appliquees

- Image alpine (`node:18-alpine`) → taille < 200 MB
- Suppression de tous les secrets du Dockerfile
- Cache Docker exploite : `COPY package*.json` → `npm install` → `COPY . .`
- `npm install --omit=dev` pour la production uniquement
- Suppression du bloc `apt-get install`
- `.dockerignore` cree (node_modules, .env, .git, logs)
- `USER node` pour ne pas tourner en root

### Verification

```bash
docker build -t tp1:corrige .
docker images tp1:corrige           # < 200 MB
docker run --rm -p 3000:3000 tp1:corrige  # localhost:3000 fonctionne
docker run --rm tp1:corrige whoami        # affiche "node"
```

> Rapport detaille : [`SujetTP1/RAPPORT-TP1.md`](SujetTP1/RAPPORT-TP1.md)

---

## TP2 - Docker Compose : stack multi-services

**Theme** : Docker Compose, volumes, .env, Adminer

**Dossier** : `SujetTP2/`

### Contexte

Trois services deja containerises (API Node.js, PostgreSQL, frontend Nginx) devaient etre lances ensemble via un `docker-compose.yml`. Les objectifs etaient de faire communiquer les services, persister les donnees, externaliser les secrets, et ajouter Adminer.

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────>│    API      │────>│  PostgreSQL  │
│  Nginx      │     │  Node.js    │     │  (database)  │
│  :8080      │     │  :3000      │     │  interne     │
└─────────────┘     └─────────────┘     └──────┬───────┘
                                               │
                    ┌─────────────┐             │
                    │  Adminer    │─────────────┘
                    │  :8081      │
                    └─────────────┘
```

### Services

| Service | Image / Build | Port | Role |
|---------|--------------|------|------|
| database | `postgres:15-alpine` | Non expose | Base de donnees PostgreSQL |
| api | Build `./api` | 3000 | API REST, lit/ecrit dans PostgreSQL |
| frontend | Build `./frontend` | 8080 | Interface web Nginx |
| adminer | `adminer` | 8081 | Administration de la base |

### Points cles

- **Secrets externalises** : fichier `.env` local, seules des references `${DB_PASSWORD}` dans le Compose
- **Persistance** : volume nomme `pg_data` sur `/var/lib/postgresql/data`
- **Securite reseau** : PostgreSQL non expose sur l'hote, accessible uniquement en interne
- **Stabilite** : `restart: on-failure` + `depends_on` sur l'API

### Verification

```bash
docker compose up --build
# http://localhost:8080 → frontend
# http://localhost:3000/health → {"status":"ok"}
# http://localhost:8081 → Adminer
# Envoyer un message → il apparait dans la liste et dans Adminer
docker compose down && docker compose up -d  # messages toujours la
```

> Rapport detaille : [`SujetTP2/RAPPORT-TP2.md`](SujetTP2/RAPPORT-TP2.md)

---

## TP3 - Conteneurisation de TaskFlow

**Theme** : Dockerfiles, Docker Compose, reseaux, volumes, .env

**Dossier** : `SujetTP3/`

### Contexte

TaskFlow est une application de gestion de taches creee et conteneurisee de zero. L'objectif est qu'une personne qui clone le repo puisse lancer toute la stack avec une seule commande (`docker compose up --build`), sans installer Node, Redis ou Nginx sur sa machine.

### Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────>│  Backend    │────>│   Redis     │
│  Nginx      │     │  Node.js    │     │  (cache)    │
│  :8080      │     │  :3001      │     │  interne    │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Services

| Service | Image / Build | Port | Role |
|---------|--------------|------|------|
| frontend | Build `./frontend` (nginx:alpine) | 8080 | Interface web statique |
| backend | Build `./backend` (node:20-alpine) | 3001 | API REST, CRUD des taches |
| cache | `redis:7-alpine` | Non expose | Stockage et persistance des taches |

### Fonctionnalites de l'application

- Ajouter une tache
- Marquer une tache comme terminee / en cours
- Supprimer une tache
- Compteurs en temps reel (total, terminees, en cours)
- Route `/health` avec statut de connexion Redis

### Points cles

- **Redis non expose** : aucun `ports:` sur le service cache, accessible uniquement par le backend
- **Persistance** : volume nomme `redis_data` pour conserver les taches
- **Reseau Docker** : reseau `taskflow-net` partage entre les 3 services
- **Configuration** : `.env.example` fourni comme template, pas de secret en dur
- **Cache Docker** : `COPY package*.json` avant `COPY . .` dans le Dockerfile backend
- **Stabilite** : `restart: on-failure` + `depends_on` sur le backend

### Structure des fichiers

```
SujetTP3/
├── backend/
│   ├── Dockerfile
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   └── index.html
├── docker-compose.yml
├── .env.example
├── .dockerignore
└── RAPPORT-TP3.md
```

### Verification

```bash
docker compose up --build
docker compose ps                          # 3 services Up
# http://localhost:8080 → interface TaskFlow
# http://localhost:3001/health → {"status":"ok","redis":"connected"}
# Ajouter / terminer / supprimer des taches
docker compose down && docker compose up -d  # taches toujours la
```

> Rapport detaille : [`SujetTP3/RAPPORT-TP3.md`](SujetTP3/RAPPORT-TP3.md)
