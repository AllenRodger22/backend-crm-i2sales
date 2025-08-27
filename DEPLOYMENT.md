# Implantação

Para executar o aplicativo em produção, defina a variável de ambiente `JWT_SECRET` com um valor seguro:

```bash
export JWT_SECRET="sua_chave_secreta"
```

Sem essa configuração, o servidor lançará um erro ao iniciar em ambiente de produção.
