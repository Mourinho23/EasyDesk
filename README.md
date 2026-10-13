# EasyDesk

Aplicação de ambiente de trabalho e painel web para consultar informações sobre o computador onde o EasyDesk está a correr.

## Funcionalidades

- Painel com dados de CPU, memória, armazenamento, discos, rede e sistema operativo.
- Aplicação de ambiente de trabalho para Windows, macOS e Linux.
- Acesso opcional ao painel a partir de outros dispositivos na mesma rede local.
- Leituras térmicas sujeitas ao hardware, aos controladores e ao sistema operativo.

## Site de downloads

O site estático está em [`site/`](site/). Deteta o sistema operativo, carrega os instaladores da última versão publicada e oferece AppImage, `.deb` e `.rpm` para Linux. Não precisa de um servidor de aplicação: pode ser alojado no GitHub Pages.

Para o publicar:

1. Envia o código atualizado para a branch `main` do repositório público. A página e os instaladores publicados serão públicos.
2. [`site/config.js`](site/config.js) já está configurado para `Mourinho23/EasyDesk`. Se publicares o projeto noutro repositório, atualiza esse identificador.
3. Nas definições do repositório, em **Pages**, seleciona **GitHub Actions** como origem de publicação.
4. Envia a alteração à branch `main`. O workflow `pages.yml` publica o conteúdo de `site/`; o endereço aparece nas definições de Pages.
5. Para gerar e publicar os instaladores, cria e envia uma etiqueta que corresponda à versão em `package.json`, por exemplo `v1.0.0`. O workflow `release.yml` compila cada sistema no respetivo runner e anexa os pacotes à versão GitHub.

O site obtém os links da API pública de versões do GitHub. Para publicar atualizações, aumenta primeiro a versão em `package.json` e usa a etiqueta correspondente, por exemplo `v1.0.1`. O endereço previsto do site é [mourinho23.github.io/EasyDesk](https://mourinho23.github.io/EasyDesk/). O site e os instaladores ficam online depois de enviares estas alterações para a branch `main`, ativares **GitHub Actions** como origem de Pages e publicares uma versão com uma etiqueta correspondente à versão em `package.json`.

## Instalar e abrir

Descarrega o instalador adequado no site EasyDesk:

- **Windows:** executa o instalador `.exe` e segue as instruções. Não é necessário instalar Node.js.
- **macOS:** escolhe Apple Silicon ou Intel, abre o `.dmg` e arrasta EasyDesk para **Aplicações**. As versões ainda não estão assinadas nem notarizadas; o macOS poderá apresentar avisos de segurança.
- **Linux:** usa o AppImage, `.deb` (Debian, Ubuntu e derivados) ou `.rpm` (Fedora, openSUSE e derivados). Algumas distribuições podem exigir FUSE para executar AppImages.

## Executar em modo de desenvolvimento

### Requisitos

- Node.js 22.12 ou superior
- npm (incluído com Node.js)

Na pasta do projeto, instala as dependências e inicia a aplicação desktop:

```sh
npm ci
npm run desktop
```

Para executar apenas o servidor web:

```sh
npm start
```

O terminal indica o endereço do painel. Para parar o servidor iniciado com `npm start`, carrega em **Ctrl+C**. Para fechar a aplicação desktop, fecha a respetiva janela.

No Windows, também podes abrir o atalho de desenvolvimento `Iniciar EasyDesk.lnk`, que inicia o servidor e abre o painel no browser.

## Criar instaladores

Instala Node.js 22.12 ou superior e executa os comandos a partir da pasta do projeto. Para compilar o auxiliar opcional de sensores do Windows, instala também o .NET SDK 8. Cria cada instalador no respetivo sistema operativo:

| Sistema onde estás a compilar | Comando | Ficheiro gerado |
| --- | --- | --- |
| Windows | `npm run dist:win` | Instalador `.exe` |
| macOS | `npm run dist:mac` | Imagem `.dmg` |
| Linux | `npm run dist:linux` | `.AppImage`, `.deb` e `.rpm` (x64) |

Primeiro instala as dependências:

```sh
npm ci
```

Depois executa **apenas o comando correspondente ao sistema onde estás a compilar**. Os ficheiros finais são colocados em `release/`. A compilação macOS pode necessitar das ferramentas de linha de comandos da Apple. O workflow `release.yml` compila automaticamente em Windows, macOS e Linux quando é enviada uma etiqueta de versão válida.

## Sensores e leituras

O instalador Windows apresenta duas opções: sem o auxiliar adicional de sensores ou com o auxiliar de temperatura e potência baseado no LibreHardwareMonitor. A segunda opção requer permissões de administrador, instala um serviço protegido do Windows e necessita do .NET Framework 4.7.2 ou superior. O serviço só é iniciado enquanto o EasyDesk está aberto e é parado quando a aplicação fecha. As leituras continuam dependentes dos sensores expostos pelo hardware e pelos controladores.

No macOS, o instalador inclui o leitor adequado a Macs Intel ou Apple Silicon. A leitura de potência usa o `powermetrics` fornecido pelo sistema e requer privilégios de administrador. No Linux, as temperaturas são lidas diretamente dos sensores expostos pelo kernel; a potência da CPU só fica disponível quando o kernel publica contadores Intel/AMD RAPL.

Os valores de potência total do sistema e de eficiência da fonte só aparecem se o próprio hardware expuser esses sensores. O EasyDesk não estima nem inventa leituras. Nenhum instalador instala controladores do fabricante ou módulos de kernel, e a disponibilidade varia conforme o equipamento e o sistema operativo.

## Acesso a partir da rede local

O servidor mostra no arranque o endereço que podes abrir no próprio computador. Para acederes a partir de um telemóvel ou de outro computador, liga ambos à mesma rede e abre nesse dispositivo o endereço LAN indicado pelo servidor.

Cada computador executa a sua própria instância e apresenta apenas os dados da máquina que está a servir o painel. O EasyDesk não agrega várias máquinas num único painel. Se o servidor deixar de responder, o estado e os campos de armazenamento e utilizador passam a **Desligado**.

## Segurança e privacidade

O servidor destina-se a uso numa rede local e ainda não tem autenticação própria. Enquanto estiver ativo, outros dispositivos que consigam aceder ao endereço poderão consultar os dados apresentados, incluindo o nome de utilizador e informações do sistema. Não encaminhes a porta 3000 para a Internet nem uses uma rede pública ou não fiável para partilhar o painel.
