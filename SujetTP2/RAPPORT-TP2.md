# TP2 - Rapport : Docker Compose - Stack multi-services

## Contexte

L'objectif est d'ecrire un `docker-compose.yml` qui fait fonctionner ensemble 3 services (API Node.js, PostgreSQL, frontend Nginx), persiste les donnees, externalise les secrets dans un fichier `.env`, et ajoute Adminer comme interface d'administration de la base.

## Etape 1 - Docker Compose

### Services definis

| Service | Image / Build | Port publie | Role |
|---------|--------------|-------------|------|
| database | `postgres:15-alpine` | Aucun (non expose) | Base de donnees PostgreSQL |
| api | Build depuis `./api` | `3000:3000` | API Node.js, lit/ecrit dans PostgreSQL |
| frontend | Build depuis `./frontend` | `8080:80` | Interface web servie par Nginx |

### Configuration de l'API

L'API recoit ses variables d'environnement via le `docker-compose.yml` :

| Variable | Valeur |
|----------|--------|
| DB_HOST | `database` (nom du service Compose) |
| DB_PORT | `5432` |
| DB_NAME | `${DB_NAME}` (depuis `.env`) |
| DB_USER | `${DB_USER}` (depuis `.env`) |
| DB_PASSWORD | `${DB_PASSWORD}` (depuis `.env`) |
| PORT | `3000` |

### Stabilisation du demarrage

`restart: on-failure` est ajoute sur le service `api`. Si PostgreSQL n'est pas encore pret quand l'API demarre, elle redemarrera automatiquement jusqu'a ce que la connexion reussisse.

`depends_on: database` est ajoute pour que Docker demarre le container `database` avant `api`.

### Securite reseau

Le service `database` n'a aucun `ports:` declare. Il n'est donc pas accessible depuis la machine hote (localhost:5432 ne repond pas). Seuls les autres services du reseau Docker interne (api, adminer) peuvent le joindre via le nom `database`.

## Etape 2a - Volume pour la persistance

Un volume nomme `pg_data` est declare et monte sur `/var/lib/postgresql/data` dans le service `database`.

```yaml
volumes:
  - pg_data:/var/lib/postgresql/data
```

Cela permet aux donnees PostgreSQL de survivre a un `docker compose down` classique (sans le flag `-v`).

## Etape 2b - Fichier .env pour les secrets

Les valeurs sensibles sont externalisees dans un fichier `.env` local :

```
DB_USER=tp2user
DB_PASSWORD=changeme123
DB_NAME=tp2db
```

Dans le `docker-compose.yml`, seules des references `${DB_PASSWORD}` apparaissent, jamais la vraie valeur.

## Etape 3 - Service Adminer

Adminer est ajoute comme 4e service :

| Parametre | Valeur |
|-----------|--------|
| Image | `adminer` (officielle Docker Hub) |
| Port | `8081:8080` |
| Variable | `ADMINER_DEFAULT_SERVER=database` (pre-remplit le champ serveur) |

Adminer se connecte a `database` via le reseau Docker interne. La base reste non exposee sur l'hote.

## docker-compose.yml final

```yaml
services:
  database:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - pg_data:/var/lib/postgresql/data

  api:
    build: ./api
    ports:
      - "3000:3000"
    environment:
      DB_HOST: database
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      PORT: 3000
    depends_on:
      - database
    restart: on-failure

  frontend:
    build: ./frontend
    ports:
      - "8080:80"

  adminer:
    image: adminer
    ports:
      - "8081:8080"
    environment:
      ADMINER_DEFAULT_SERVER: database

volumes:
  pg_data:
```

## Guide de verification

### 1. Lancer la stack

```
cd SujetTP2
docker compose up --build
```

Sortie attendue : les 4 services demarrent. Les logs affichent `database system is ready to accept connections` pour PostgreSQL et `API demarree sur le port 3000` pour l'API.

### 2. Tester le frontend

Ouvrir http://localhost:8080 dans le navigateur.

Sortie attendue : la page s'affiche avec le titre "TP2 — Docker Compose" et un formulaire pour envoyer des messages.

### 3. Tester l'API

Ouvrir http://localhost:3000/health dans le navigateur.

Sortie attendue :
```json
{"status":"ok"}
```

### 4. Tester la communication API - BDD

Depuis le frontend (http://localhost:8080), taper un message dans le formulaire et cliquer "Envoyer".

Sortie attendue : le message apparait dans la liste sous le formulaire avec sa date.

### 5. Verifier que la BDD n'est pas exposee

```
PS> Test-NetConnection -ComputerName localhost -Port 5432
```

Sortie attendue : `TcpTestSucceeded : False`. Le port 5432 n'est pas accessible depuis la machine hote.

### 6. Tester Adminer

Ouvrir http://localhost:8081 dans le navigateur.

Sortie attendue : l'interface de connexion Adminer s'affiche.

Se connecter avec :
- Systeme : **PostgreSQL**
- Serveur : **database** (pre-rempli)
- Utilisateur : **tp2user**
- Mot de passe : **changeme123**
- Base de donnees : **tp2db**

Sortie attendue : la table `messages` est visible et contient les messages envoyes depuis le frontend.

### 7. Tester la persistance des donnees

```
PS> docker compose down
PS> docker compose up -d
```

Ouvrir http://localhost:8080.

Sortie attendue : les messages envoyes precedemment sont toujours affiches. Les donnees ont survecu au redemarrage grace au volume `pg_data`.

### 8. Verifier l'absence de secrets en dur

```
PS> Select-String -Path docker-compose.yml -Pattern "password" -CaseSensitive:$false
```

Sortie attendue : seules des references `${DB_PASSWORD}` apparaissent, jamais la valeur reelle du mot de passe.

## Criteres de reussite

| Critere | Resultat |
|---------|----------|
| Frontend accessible | http://localhost:8080 affiche la page |
| API accessible | http://localhost:3000/health repond `{"status":"ok"}` |
| Communication API - BDD | Un message envoye depuis le frontend s'affiche dans la liste |
| BDD non exposee | localhost:5432 ne repond pas |
| Adminer accessible | http://localhost:8081 affiche l'interface |
| Adminer connecte a la BDD | La table `messages` est visible dans Adminer |
| Donnees persistantes | Les messages survivent a `docker compose down` puis `docker compose up -d` |
| Pas de secrets en dur | `grep password docker-compose.yml` ne montre pas le vrai mot de passe |
