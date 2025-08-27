# CRM Backend

API em Node.js + Express + PostgreSQL para gerenciamento de clientes e funil de vendas.

## Variáveis de ambiente

Configure um arquivo `.env` com as variáveis abaixo:

- `DATABASE_URL` **ou** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `DB_HOST_IPV4` – opcional; endereço IPv4 forçado caso o host resolva apenas em IPv6
- `JWT_SECRET` – chave para assinar os tokens JWT
- `NODE_ENV` – `production` habilita SSL no banco
- `PORT` – porta do servidor (opcional)

## Desenvolvimento

```bash
npm install
npm start
```

Rotas úteis:

- `GET /__health` – verifica conexão com o banco
- `POST /__echo` – retorna o corpo recebido (debug)
- `POST /auth/login` – autenticação, retorna `{ token, user }`
- `GET /auth/me` – retorna o usuário autenticado

## Deploy na Render

1. Criar um novo **Web Service** apontando para este repositório.
2. Definir o comando de build: `npm install`.
3. Definir o comando de start: `node server.js`.
4. Informar as variáveis de ambiente no painel (ver lista acima).

## Testes com `curl`

```bash
# healthcheck
curl https://<host>/__health

# echo do corpo
curl -X POST https://<host>/__echo -H 'Content-Type: application/json' -d '{"hello":"world"}'

# login
curl -X POST https://<host>/auth/login -H 'Content-Type: application/json' -d '{"email":"user@example.com","password":"senha"}'

# rota protegida (substitua TOKEN pelo JWT)
curl https://<host>/clients/ping -H "Authorization: Bearer TOKEN"
```

