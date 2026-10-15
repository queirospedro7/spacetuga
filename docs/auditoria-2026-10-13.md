# Auditoria do Tuga — 13 de outubro de 2026

Foi revisto o código do servidor HTTP/WebSocket, autenticação, mensagens, uploads, canais, cargos, administração, ligações WebRTC, definições, perfis, GIFs, estilos, PWA e configuração Tauri. Foram corrigidas falhas confirmadas e acrescentado um teste de integração reproduzível. A revisão não permite afirmar que toda a aplicação está livre de bugs.

## Problemas corrigidos

| Área | Falha encontrada | Alteração |
| --- | --- | --- |
| Canais ocultos | As mensagens, ficheiros, reações e votações eram difundidos para membros sem acesso. | A emissão de eventos verifica a leitura do canal para cada destinatário. Os canais ocultos deixam de aparecer nos dados enviados a esses membros. |
| Histórico | O conteúdo de um canal revogado podia continuar no estado do cliente. | O cliente elimina as mensagens de canais removidos da sua vista autorizada. |
| Descoberta pública | A lista pública incluía IDs de todos os membros e canais. | Passa a enviar contagens, sem divulgar a lista de membros nem os canais aos visitantes. |
| Servidores privados | Era possível entrar usando o ID do servidor, em vez do convite. | A entrada pelo ID só funciona em servidores públicos. Os privados exigem convite. |
| Cargos | Um gestor de cargos podia criar ou atribuir um cargo de administrador. | A criação, edição, eliminação e atribuição verificam se o autor pode conceder as permissões envolvidas. |
| Permissões básicas | `sendMessages` e `connectVoice` não eram aplicados. | O servidor verifica essas permissões também em uploads, ficheiros, votações e entrada em voz. |
| Revogação de voz | Eliminar um canal, retirar acesso, expulsar um membro ou suspender um servidor podia deixar a chamada ativa. | Os participantes removidos recebem a ordem de saída; alterações de cargos também revalidam a presença em voz. |
| Contas suspensas | Um JWT existente podia continuar a autorizar pedidos HTTP. | A verificação do JWT recusa contas suspensas. Contas restritas também deixam de contornar os bloqueios através de ficheiros, votações e chamadas. |
| Palavra-passe | O formulário apresentava sucesso sem alterar nada. | Valida a palavra-passe atual, guarda o novo hash, emite um novo JWT e invalida tokens anteriores por versão. |
| Definições e administração | Algumas ações mostravam sucesso ou terminavam o carregamento por temporizador. | Perfil, privacidade, entrada em servidores e alterações administrativas aguardam confirmação do servidor. |
| Contactos | A preferência de receber mensagens de novos contactos era apenas local. | É persistida e aplicada pelo servidor a mensagens, ficheiros, votações e convites de chamada. Conversas existentes permanecem disponíveis. |
| Anexos | O JWT era colocado nas ligações de imagens. | As imagens são obtidas com o cabeçalho de autorização e exibidas através de URLs de objetos locais. Tokens em parâmetros de URL deixam de autenticar pedidos. |
| Ficheiros ativos | Um SVG enviado como imagem podia ser servido diretamente como conteúdo ativo. | Apenas formatos raster conhecidos são servidos inline; restantes ficheiros são transferidos com isolamento e proteção contra interpretação de conteúdo. |
| PWA | O service worker podia guardar respostas autenticadas se o backend fosse publicado na mesma origem. | A cache exclui API, pedidos autenticados e ligações com tokens; a cache anterior é invalidada. |
| Segredos | Dados locais, uploads e ficheiros de segredos não estavam todos excluídos do Git. | Foram acrescentadas regras para dados, JWT, configurações privadas do TURN e ficheiros de ambiente. |
| Sessões | Uma ligação antiga podia apagar a referência de uma nova; ações pendentes sobreviviam à saída da conta. | Há identificação da ligação atual, limpeza da fila e cancelamento das tentativas de reconexão. A substituição de sessão encerra o estado de chamada anterior. |
| Chamadas pendentes | Um utilizador que já estava a ligar podia receber outra chamada. | O servidor verifica também os autores de convites pendentes. |
| Cancelamento | O convite recebido não era eliminado quando o autor desligava; acesso tardio ao microfone podia criar uma chamada cancelada. | O convite é limpo e as operações de media validam a chamada ou a geração da entrada em voz antes de utilizar o resultado. |
| Áudio e vídeo | A pista de vídeo recebida podia substituir o stream que continha o microfone. | As pistas remotas são agregadas num stream por ligação. A reprodução de vídeo não duplica a reprodução do microfone. |
| Câmara remota | Uma pista pausada podia continuar a ser apresentada como vídeo ativo. | Eventos de pausa, retoma e fim atualizam a vista. |
| Definições durante chamadas | Abrir as definições ou a administração desmontava o ecrã da chamada. | A interface de comunicação permanece montada sob os painéis. |
| Media e testes | Fechar um painel enquanto o sistema pedia permissão podia deixar uma captura tardia ativa. | As capturas verificam se o painel continua ativo; os streams e contextos de áudio dos testes são encerrados. |
| Moderação | Reativar o microfone por moderação podia contrariar o ensurdecimento. | O estado de moderação, o mute pessoal e o ensurdecimento são combinados; o cliente não permite contrariar um mute de moderação. |
| Conversas | O texto e anexos de uma conversa podiam acompanhar a mudança para outra. | O compositor é recriado ao mudar de destinatário ou canal. |
| Eliminação de DMs | Qualquer destinatário podia apagar a mensagem da outra pessoa para ambos. | A eliminação é reservada ao autor e à administração global; o menu acompanha a permissão. |
| GIFs | A normalização podia alterar maiúsculas de IDs do Giphy; favoritos aceitavam valores sem validação. | Mantém os IDs, exige HTTPS, valida os domínios e filtra os favoritos inválidos. |
| Imagens de perfil | GIFs demasiado grandes podiam ser convertidos para imagens estáticas ou ultrapassar o limite da mensagem. | Os GIFs animados têm um limite explícito; imagens comprimidas continuam sujeitas ao limite final. SVG e URLs HTTP não são aceites como imagens de perfil. |
| Visual | O palco de voz podia usar texto escuro sobre fundo escuro no tema claro. | O palco usa a paleta escura de forma explícita. Os textos de destaque têm variantes de contraste para ambos os temas. |
| Preferências visuais | Densidade, fonte e cantos guardados só eram aplicados depois de visitar as definições. | São restaurados ao iniciar a aplicação. |
| Downloads e Tauri | O botão não transferia um instalador e anunciava plataformas sem pacote; a porta de desenvolvimento não correspondia ao Vite. | O botão exige uma ligação publicada, a instalação PWA foi ligada ao evento do navegador e a porta Tauri foi alinhada. |
| Backend partilhado | Os clientes estavam fixos na porta e no servidor local. | O endereço pode ser definido por `VITE_TUGA_API_URL`, com origens adicionais explicitamente autorizadas pelo servidor. |
| Resistência a erros | Pedidos malformados e erros de frames WebSocket podiam derrubar o processo. | O servidor contém erros de protocolo, limita ações e fecha ligações abusivas. Foi acrescentado heartbeat e prazo para autenticação. |
| Persistência | Uma base de dados ilegível podia ser tratada como uma base vazia. | O arranque falha preservando o ficheiro, em vez de iniciar a substituição dos dados. |

## Funcionalidades e limitações identificadas na auditoria inicial

A revisão 0.2.0 concluiu áudio da partilha, câmara/ecrã independentes, controlos reais de áudio, ganho a 200%, atalhos, sons e notificações. A migração Tailwind eliminou os cinco alertas npm. Chamadas entre dois clientes isolados e imagens no navegador foram verificadas; foram regenerados os instaladores. O estado atual e os limites estão em [implementacao-0.2.0.md](implementacao-0.2.0.md). A tabela seguinte preserva os resultados da auditoria inicial.

| Prioridade | Problema confirmado | Trabalho necessário |
| --- | --- | --- |
| Alta | A partilha captura áudio do sistema, mas os hooks de publicação substituem/adicionam apenas a pista de vídeo. | Publicar uma pista de áudio de partilha separada do microfone e separar receção/volumes. |
| Alta | Câmara e partilha usam o mesmo emissor de vídeo; o destinatário não recebe duas vistas independentes. | Separar os emissores e identificar os streams na sinalização e na interface. |
| Alta | Volume global de entrada/saída, redução de ruído e cancelamento de eco nas definições não estão ligados ao processamento real das chamadas. | Integrar as preferências nas capturas e no grafo de áudio, incluindo alterações durante a chamada. |
| Alta | O mute de moderação depende de o cliente obedecer. A permissão `speakVoice` não constitui uma barreira de media no servidor. | Para impor silêncio a clientes modificados, é necessário controlar a media num serviço SFU. A sinalização P2P, por si só, não pode garantir isso. |
| Alta | Cada instalação Tauri inicia um servidor próprio por defeito. | Publicar um backend comum e compilar os clientes com esse endereço para comunicação entre computadores. A opção de configuração foi acrescentada, mas nenhum serviço foi publicado nesta revisão. |
| Alta | A configuração TURN está preparada, sem demonstração de um serviço público operacional. | Validar o serviço, domínio, certificado e redes onde a ligação direta falha. |
| Média | O controlo de volume individual permite valores até 200%, mas a reprodução com `HTMLMediaElement.volume` limita-os a 100%. | Usar ganho Web Audio para amplificar, ou limitar o controlo ao intervalo efetivamente suportado. |
| Média | O seletor de GIFs é um gestor de ligações/favoritos, sem pesquisa integrada num catálogo. Favoritos de anexos privados não têm uma referência persistente reutilizável. | Integrar um fornecedor de pesquisa e um fluxo autorizado para reutilizar anexos guardados. |
| Média | Os atalhos Ctrl+K, Ctrl+Shift+M, Ctrl+Shift+D e Ctrl+, são apresentados nas definições sem implementação correspondente na aplicação. | Implementar os handlers, foco de pesquisa e tratamento dos campos de texto. |
| Média | A opção de som de mensagens não corresponde ainda a um sinal emitido na receção; pedir permissão de notificações não cria notificações por mensagem. | Implementar os eventos de receção, preferências e notificações, com proteção de conteúdo privado. |
| Média | Não existe saída voluntária de servidor, banimento persistente, transferência de propriedade, amizade/convites pessoais, recuperação de palavra-passe ou autenticação multifator. | Implementar os fluxos e permissões correspondentes. Expulsar um membro não impede que regresse com um convite válido. |
| Média | O armazenamento JSON usa operações síncronas, guarda alterações por atraso e elimina histórico acima dos limites existentes. Uploads sem mensagem ou após eliminação não têm limpeza automática. | Definir retenção, quotas e confirmação durável; substituir o ficheiro JSON por uma base de dados transacional antes de escalar a plataforma. |
| Média | O servidor mantém uma ligação WebSocket por conta e substitui a anterior. O painel mostra apenas a sessão atual. | Se forem necessárias sessões simultâneas, criar um registo de sessões por dispositivo e revogação individual. |
| Média | Existem vários formulários de perfil/definições com comportamento duplicado e alguns botões de gestão de servidor continuam a mostrar sucesso antes de uma confirmação. | Unificar os formulários e aplicar o padrão de confirmação também à gestão de cargos e estrutura. |

## Verificação realizada

- Compilação de produção e TypeScript concluídos com sucesso.
- ESLint sem erros; permanecem avisos de atualização rápida em componentes visuais.
- Sintaxe do servidor e do service worker verificada.
- Teste de integração `npm run test:audit` aprovado, usando quatro contas fictícias e dados temporários. Cobre canais ocultos, ficheiros, SVG, reações, votações, cargos, acesso à voz, chamadas pendentes, sinalização autorizada, recibos opcionais, contactos, palavra-passe, restrições, suspensão e pedidos malformados/sobredimensionados.
- `npm audit --omit=dev` não assinalou vulnerabilidades nas dependências de produção.
- A auditoria completa passou de sete avisos para cinco. Foi atualizado o `postcss-selector-parser`; os cinco avisos altos restantes pertencem à cadeia de compilação do Tailwind 3 através de `braces`, `chokidar`, `micromatch` e `fast-glob`. A versão mais recente publicada de `braces` consultada ainda era 3.0.3. A atualização automática proposta envolve migrar para Tailwind 4.
- O ficheiro principal da interface continua com cerca de 570 KB minificados, aproximadamente 159 KB comprimidos; definições, administração e descoberta são carregadas separadamente.

Não foi feita validação visual automática no navegador, nem uma chamada real entre dispositivos com microfone, câmara, partilha e TURN. As alterações de media foram verificadas no código e na compilação; os testes validam a sinalização e as permissões, não a transmissão física de áudio/vídeo.

Os dados existentes em `server/data.json` não foram usados pelos testes. Os instaladores Tauri existentes não foram regenerados nesta auditoria. É necessário reiniciar o servidor para carregar as alterações e gerar um novo pacote Tauri para as distribuir na aplicação instalada.
