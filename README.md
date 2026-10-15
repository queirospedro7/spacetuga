# Tuga

Última revisão: 0.2.1 — [correções de chamadas, fotos, destaque de voz e gravação dos servidores](docs/correcoes-0.2.1.md).

Tuga é uma aplicação de conversas, comunidades e chamadas com uma interface sóbria, tipografia Lexend e controlos compactos. A aplicação inclui mensagens diretas, canais de texto, canais informativos com publicação restrita, canais de voz, chamadas WebRTC, partilha de ecrã, votações, reações, GIFs, bloqueio de utilizadores e permissões de acesso por canal.

## Executar no computador

1. Instala Node.js 20 ou mais recente.
2. Abre `start.bat`. Na primeira execução instala as dependências necessárias.
3. O arranque inicia o servidor e a interface, escolhe uma porta livre e abre o navegador. Mantém a janela aberta; Ctrl+C termina os processos iniciados nessa janela. Também podes usar `npm start`.
4. Para compilar a interface, corre `npm run build`.

A aplicação cria um segredo JWT local ao lado do ficheiro de dados na primeira execução. Em produção, define um `TUGA_JWT_SECRET` aleatório com pelo menos 32 bytes e mantém-no fora do repositório. Os tokens expiram ao fim de 12 horas. Os endpoints HTTP de perfil, configuração WebRTC e ficheiros exigem `Authorization: Bearer <JWT>`.

## Enviar ficheiros

Os ficheiros podem ser anexados em mensagens diretas e canais de texto/aviso. O limite é 50 MB por ficheiro. O servidor guarda os conteúdos fora do JSON de mensagens e valida permissões antes do envio e de cada transferência. Em produção, define armazenamento persistente, cópias de segurança e uma política de retenção para a pasta de uploads junto do ficheiro de dados.

## Servidor TURN

A integração TURN usa credenciais temporárias coturn REST calculadas no servidor, sem expor a chave partilhada no cliente. Configuração, portas necessárias e ficheiros de exemplo estão em [deploy/coturn/README.md](deploy/coturn/README.md). Sem essas variáveis, a chamada usa o servidor STUN de fallback; um TURN público requer domínio, certificado TLS e serviço coturn ativos.

## Aplicação Windows

Na versão 0.2.3, o serviço desktop usa uma porta própria, encerra após gravar alterações pendentes e não inicia quando uma API externa é configurada na compilação. A aplicação mantém uma única execução e inclui Lexend localmente. **Poupar recursos**, nas definições de aparência, está ativo por predefinição no desktop.

Para desenvolvimento desktop, usa `npm run tauri:dev`. Para gerar instaladores Tauri, usa `npm run tauri:build`; a pasta de saída é `src-tauri/target/release/bundle`. A compilação prepara automaticamente o runtime Node usado pelo servidor local da aplicação.

O servidor local de cada instalação guarda contas próprias. Para pessoas em computadores diferentes comunicarem na mesma plataforma, publica um backend partilhado com HTTPS e compila os clientes com `VITE_TUGA_API_URL=https://api.exemplo.pt`. O servidor aceita origens adicionais listadas em `TUGA_ALLOWED_ORIGINS`, separadas por vírgulas. Estas opções encontram-se em `.env.example`; um serviço TURN precisa de ser publicado separadamente.

Para ativar o botão de transferência nas definições, define `VITE_TUGA_WINDOWS_DOWNLOAD_URL` com a ligação pública HTTPS do instalador publicado. Sem uma ligação configurada, a interface indica que o instalador está indisponível. Os binários existentes não são atualizados pela compilação web: gera novamente o pacote Tauri para distribuir as alterações.

## Verificação

A revisão mais recente é a **0.2.3**, com otimizações Tauri, chamada preservada ao navegar, partilha ocultável, grupos e ações administrativas confirmadas. Resultados e limitações estão em [docs/revisao-0.2.3.md](docs/revisao-0.2.3.md).

`npm run test:browser` verifica dois clientes isolados, chamadas diretas e num servidor, vídeo e som gerados, partilha independente da câmara, volumes, mute/deafen, atalhos e notificações. `npm run test:start` verifica o arranque do `start.bat` com dados temporários. Resultados, imagens e limites da validação estão em [docs/implementacao-0.2.0.md](docs/implementacao-0.2.0.md).

## Chamadas e atalhos

O microfone, a câmara, o ecrã e o áudio do ecrã são transmitidos separadamente. O som da partilha depende de o navegador e a fonte selecionada disponibilizarem captura de áudio. As definições de entrada/saída, ruído e eco aplicam-se à chamada em curso. Os volumes individuais e da partilha permitem ganho até 200%. A qualidade e os FPS ajustam as pistas e os limites de transmissão; o equipamento e a ligação determinam o resultado real.

- Ctrl+K: minimizar chamada e pesquisar conversas.
- Ctrl+Shift+M: silenciar/ativar microfone.
- Ctrl+Shift+D: ensurdecer/reativar receção; ensurdecer também silencia o microfone.
- Ctrl+,: abrir definições.

As notificações precisam de permissão do sistema/navegador. Mostram um aviso genérico quando a aplicação está em segundo plano; o conteúdo privado das mensagens não aparece no aviso.

`npm run test:audit` inicia um servidor numa porta temporária com quatro contas fictícias e uma base de dados temporária. Verifica permissões, privacidade, chamadas e alterações de conta sem utilizar os dados de `server/data.json`. `npm run lint` e `npm run build` verificam a interface. O relatório da revisão de 13 de outubro de 2026 está em [docs/auditoria-2026-10-13.md](docs/auditoria-2026-10-13.md).

## Grupos privados

Na área de mensagens, usa o **+** junto de **Grupos** para escolher um nome e entre 2 e 19 contactos. O grupo inclui quem o cria e disponibiliza conversa e chamada privadas. Os grupos aparecem nessa lista, separados dos servidores. Usa a gestão de membros para adicionar pessoas posteriormente. Detalhes em [docs/grupos-2026-10-14.md](docs/grupos-2026-10-14.md).

## Canais de avisos

Criadores e administradores podem criar um canal do tipo **Avisos**. Todos os membros com acesso podem ler; apenas a administração do servidor pode publicar. As permissões de leitura por utilizador aplicam-se também a estes canais.
