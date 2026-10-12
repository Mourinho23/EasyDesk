# EasyDesk

Painel local para consultar informacoes do computador que esta a executar o servidor.

## Requisitos

- Node.js 18 ou superior (recomendado: versao LTS)
- npm

O projeto usa `systeminformation` para recolher os dados disponiveis no macOS, Windows e Linux. A disponibilidade de temperaturas, energia e detalhes de componentes varia conforme o sistema operativo, o hardware e as permissoes. Campos sem leitura aparecem como **Nao encontrado**.

## Instalar e executar

Na pasta do projeto:

```sh
npm install
npm start
```

O servidor mostra o endereco local ao iniciar. Abre esse endereco no computador. Para testar num telemovel, liga-o a mesma rede local e abre o endereco LAN mostrado no terminal. Se o IP do computador mudar, usa o novo endereco indicado no arranque.

### Atalho no Windows

Na pasta do projeto, abre `Iniciar EasyDesk.lnk`. O atalho inicia o servidor e abre o painel no navegador; fecha a janela **EasyDesk - servidor** para parar a aplicacao. Se as dependencias estiverem em falta ou incompletas, o atalho reinstala-as automaticamente.

### App silenciosa no macOS

No Terminal, dentro da pasta do projeto, executa uma vez:

```sh
bash criar-app-macos.sh
```

O script cria `EasyDesk.app` no Ambiente de Trabalho com o icone da mesa e do E. Abrir a app inicia o servidor em segundo plano e abre o browser sem mostrar o Terminal. A app fica ativa no Dock; fecha-a para parar o servidor. As dependencias sao instaladas automaticamente na primeira abertura. Os registos ficam em `~/Library/Logs/EasyDesk.log`.

## Varios computadores

Cada computador tem de descarregar o projeto, executar `npm install` e `npm start` nele. Cada instancia recolhe os dados do computador onde esta a correr e tem o seu proprio endereco IP. O telemovel pode abrir o endereco de cada computador na mesma rede.

A aplicacao atual nao agrega varios computadores num unico painel: cada endereco mostra apenas a maquina que esta a servir aquela pagina.
O painel mostra a unidade do sistema operativo e o utilizador da conta que iniciou o servidor. Se o computador deixar de responder, o estado, o armazenamento e o utilizador aparecem como **Desligado**.

## GitHub

Cria um repositorio no GitHub (recomenda-se privado enquanto o projeto esta em desenvolvimento). Depois de criares o repositorio vazio, executa na pasta do projeto, substituindo o URL pelo teu:

```sh
git init -b main
git add .
git commit -m "Versao inicial"
git remote add origin https://github.com/UTILIZADOR/REPOSITORIO.git
git push -u origin main
```

`node_modules` esta excluido do Git; cada pessoa instala as dependencias localmente com `npm install`.

## Acesso e limitacoes

- O servidor destina-se a testes numa rede local. Nao encaminhes a porta 3000 para a Internet.
- Os enderecos IP sao atribuidos pela rede e podem mudar; o projeto nao depende de um IP fixo.
- Alguns sensores, incluindo temperatura e consumo eletrico, podem exigir ferramentas ou permissoes adicionais e nao estao disponiveis em todos os computadores.
