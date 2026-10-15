# Tuga 0.2.0 — implementação e validação

Revisão de 13 de outubro de 2026. Os dados e segredos existentes não foram usados pelos testes.

## Funcionalidades concluídas

- Quatro pistas independentes em chamadas diretas e de servidor: microfone, câmara, ecrã e áudio do ecrã. Desligar a câmara conserva a partilha; parar o ecrã termina também o respetivo áudio.
- Identificação dos fluxos na sinalização e associação aos canais WebRTC negociados. Corrigido o problema que podia deixar o participante que atendia com emissores não associados.
- Reprodução remota pelo Web Audio com saída global, voz individual e som da partilha separados. Ganho individual até 200%, com limitador. Corrigida a ativação da descodificação de áudio remoto no Chromium.
- Ganho real de entrada, redução de ruído e cancelamento de eco aplicados às capturas, incluindo alterações durante a chamada. Fechar a chamada liberta a captura original e os contextos de áudio.
- Qualidade/FPS persistentes e aplicados à captura e ao emissor da partilha.
- Deafen silencia ambos os fluxos recebidos e o microfone.
- Atalhos Ctrl+K, Ctrl+Shift+M, Ctrl+Shift+D e Ctrl+,. Chamada direta minimizável sem interromper os fluxos.
- Sons de receção e notificações de mensagens/chamadas no navegador e integração nativa Tauri. Avisos sem conteúdo privado, com preferências e navegação por clique.
- Correções visuais: câmara local reanexada ao mudar a vista de partilha; avatares compactos sem corte nas miniaturas da sala.
- Tailwind 4, configuração existente preservada. As auditorias npm completa e de produção assinalaram zero vulnerabilidades.
- `start.bat`: instala dependências quando necessário, inicia backend/interface, escolhe porta livre, abre navegador e termina os processos que iniciou com Ctrl+C. Um backend antigo/incompatível não é terminado automaticamente.
- Versão 0.2.0 e integração de notificações incluídas na distribuição Tauri Windows.

## Verificação

| Verificação | Resultado |
| --- | --- |
| Auditoria de permissões, privacidade, chamadas e contas | `npm run test:audit` aprovado com base temporária |
| Dois clientes Chrome isolados | `npm run test:browser` aprovado |
| Som efetivamente recebido | RMS positivo no microfone e partilha da chamada direta; energia de áudio positiva nas duas pistas da sala |
| Câmara e ecrã simultâneos | Dois vídeos recebidos e apresentados na chamada direta e na sala |
| Ganhos | 200% por fluxo e saída global a 25% confirmados no grafo de áudio |
| Controlo de entrada | Slider a zero silencia o ganho; preferências de ruído/eco aplicadas à captura |
| Mute/deafen e encerramento | Microfone silenciado ao ensurdecer; conexões e capturas terminadas ao sair |
| Atalhos | Pesquisa com foco, abrir definições, mute/deafen, minimizar/reabrir |
| Notificações | Entrega verificada com permissão simulada; conteúdo privado ausente |
| Arranque Windows | `npm run test:start` aprovado usando o próprio `start.bat` |
| TypeScript e compilação web | Aprovados |
| ESLint | Zero erros; nove avisos de Fast Refresh em componentes utilitários existentes |
| Dependências npm | Zero vulnerabilidades, incluindo ferramentas de compilação |
| Distribuição Windows | Instaladores Tuga 0.2.0 EXE e MSI regenerados |
| Servidor atualizado | Arranque confirmado; `/api/health` responde com versão 0.2.0 |

Imagens revistas: [chamada direta](validation/call-screen-and-camera.png), [sala de servidor](validation/server-call.png), [definições de áudio](validation/audio-settings.png), [modal da chamada](validation/call-settings.png) e [chamada em ecrã móvel](validation/mobile-call.png).

Os instaladores estão em `src-tauri/target/release/bundle/nsis/Tuga_0.2.0_x64-setup.exe` e `src-tauri/target/release/bundle/msi/Tuga_0.2.0_x64_en-US.msi`. Foram compilados, sem instalar sobre a aplicação ou os dados existentes.

## Limites e pendências externas

Os testes usam vídeo em canvas e som gerado, sem captar o ecrã ou dispositivos pessoais. Não substituem uma chamada entre computadores em redes diferentes, nem validam microfones/câmaras físicos, permissões reais de notificações Windows ou um serviço TURN público. A partilha de áudio depende da fonte e do suporte do navegador/WebView.

Para comunicação entre instalações, continua a ser necessário publicar um backend comum e configurar o respetivo endereço. TURN precisa de domínio, TLS, credenciais e serviço operacional; os ficheiros coturn existentes são preparação de implantação, não prova de um serviço ativo.

As outras limitações funcionais da auditoria anterior continuam documentadas: SFU para imposição de moderação de media, pesquisa de catálogo de GIFs, saída/banimento/transferência de servidor, recuperação de conta/MFA, armazenamento transacional e sessões simultâneas. Não foram consideradas concluídas por esta revisão.
