FROM node:18

WORKDIR /app

# Clé API en dur dans l'image
ENV API_KEY=sk-prod-abc123xyz456
ENV DB_PASSWORD=supersecret123
ENV DB_HOST=prod-db.monapp.com

# On copie tout le projet d'un coup
COPY . .

# On installe les dépendances APRÈS avoir copié le code
# (le cache npm sera invalidé à chaque modification de code)
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
