# Tuga 0.2.3 — revisão funcional e otimização desktop

14 de outubro de 2026. Inspeção dos fluxos centrais da interface, servidor e integração Tauri. Os testes usam contas, ficheiros e bases de dados temporários; os dados existentes e as chaves de sessão foram preservados.

## Chamadas e partilha

- Ocultar a partilha repõe a grelha normal: cartões e avatares grandes, nomes visíveis e distribuição habitual dos participantes. Mostrar novamente recupera o painel.
- A câmara e a partilha mantêm-se a transmitir ao navegar para mensagens ou outro canal. A página da chamada permanece montada até à saída; as pré-visualizações param quando a página está oculta.
- O vídeo remoto deixa de receber repetidamente o mesmo `srcObject` a cada destaque de voz. A fonte muda apenas quando necessário.
- Medidores de voz reutilizados por pista, com análise visual suspensa quando a chamada está oculta ou a aplicação está em segundo plano.
- Um contexto Web Audio de receção partilhado entre os participantes, preservando volumes individuais, áudio do ecrã, limitadores e deafen.
- Limpeza explícita de listeners, fontes, ganhos, limitadores e pistas. O encerramento pode ser chamado repetidamente sem repetir efeitos.
- Moderação do microfone apresenta sucesso após confirmação. Os botões respeitam as permissões do servidor.
- O ícone de ecrã inteiro acompanha a saída por Escape. Cancelar a seleção de ecrã não produz um aviso de erro; falhas reais e troca de câmara indisponível apresentam mensagens.

## Otimizações para Tauri

### Arranque e ciclo de vida

- O serviço local usa uma porta disponível, separada da execução no navegador. O frontend recebe o endereço por um comando Tauri antes de abrir a sessão.
- Identidade da aplicação e caminho de dados preservados para compatibilidade com atualizações.
- Uma única execução desktop: abrir novamente traz a janela existente para a frente, evitando dois servidores sobre os mesmos dados. Configuração conforme a [documentação oficial de Single Instance do Tauri](https://v2.tauri.app/plugin/single-instance/).
- Com `VITE_TUGA_API_URL` configurado na compilação, o servidor Node local não inicia. O runtime continua incluído no pacote atual, embora não seja executado nesse modo.
- O fecho envia uma instrução pela entrada privada do processo local para gravar alterações pendentes. Existe uma espera limitada e terminação de recurso se necessário; não foi criado um endpoint público de encerramento.
- O limite de 128 MB refere-se ao heap antigo do Node local, não à RAM total da aplicação ou do WebView2.
- Indicador de preparação, recuperação de falhas de carregamento e ecrã de recuperação de erros de apresentação, em vez de página vazia.

### Interface e recursos

- Chamadas, configurações de chamada e servidor, definições e administração carregadas separadamente, conforme a utilização.
- Maior ficheiro JavaScript: aproximadamente 616 KB antes e 357 KB depois. Os módulos comuns continuam necessários; esta comparação não representa uma redução igual da transferência total ou da RAM.
- Compilação sem o aviso anterior de ficheiros JavaScript acima de 600 KB.
- Lexend variável incluída localmente, com caracteres portugueses e licença OFL. Não depende de Google Fonts no arranque.
- **Poupar recursos**, em Definições → Aparência, ativo por predefinição no desktop: reduz efeitos de vidro. Animações CSS pausam em segundo plano.
- Pré-visualizações de imagens carregadas perto da área visível, pedidos cancelados ao sair e URLs temporários libertados. Imagens acima de 12 MB aparecem como anexos para transferência, evitando carregar vários ficheiros grandes automaticamente.
- Sons reutilizam um contexto e libertam-no após inatividade, incluindo quando a reprodução é bloqueada.

## Funcionalidades revistas

- Grupos privados com 3 a 20 pessoas na criação, separados dos servidores. Limite de 20 validado também ao adicionar membros ou entrar por convite.
- Saída de grupos e servidores com confirmação, retirada de cargos/acesso e desligamento da chamada. O criador pode eliminar o grupo; a transferência de propriedade continua pendente.
- Convites excluídos das respostas privadas de membros sem permissão. Botões e menus usam a mesma regra.
- Adição de membros e reordenação de canais aguardam confirmação; sucesso sem atrasos arbitrários.
- Eliminações de mensagens, canais, separadores e cargos confirmadas. Atribuição de administração e remoção de membros também aguardam a alteração efetiva.
- Falhas de transferência no visualizador de imagens apresentam mensagem, sem promessa rejeitada não tratada.
- Ocupado suprime sons e avisos de mensagens, mantendo avisos de chamada; preferências de notificações preservadas.
- Indicador de ligação interrompida e nova tentativa. Falhas de envio mantêm rascunhos.
- Limites de frames por ligação, além de limite agregado por IP: pessoas na mesma rede deixam de consumir o mesmo pequeno orçamento.

## Âmbito e evidência

| Área | Inspeção e validação |
| --- | --- |
| Contas | Registo/login, JWT, sessões, palavra-passe, perfis, imagens, bloqueios e estados de conta |
| Mensagens | Texto, rascunhos, falhas de envio, anexos, votos, reações, eliminação e recibos |
| Servidores | Criação, privacidade, canais, cargos, membros, convites, reordenação, administração e saída |
| Grupos | Criação de três pessoas, mensagens para todos, chamada, saída e eliminação |
| Chamadas | Microfone, câmara e ecrã independentes, som do ecrã, volumes, deafen, atalhos, destaque e navegação |
| Interface | Temas, contraste, definições, seletores, modais, layouts móveis e recuperação de rotas |
| Desktop | Serviço local/remoto, ciclo de vida, porta própria, CSP, execução única e compilação Windows |
| Distribuição | Versões, `start.bat`, fontes locais e instaladores |

A inspeção incidiu nos módulos centrais e nos componentes de suporte. Os componentes de biblioteca foram abrangidos por compilação, lint e páginas exercitadas. Isto não demonstra ausência de todos os bugs nem valida todas as combinações de equipamento e rede.

## Resultados

- **Auditoria de integração aprovada:** permissões, privacidade, anexos, contas, grupos, saída, clientes no mesmo IP e proteção de pedidos.
- **Navegador aprovado:** fluxos completos, três clientes em chamada, receção de áudio de ambos os pares, moderação, navegação sem parar partilha, grelha normal ao ocultar, eliminação de mensagens/cargos e layouts móveis.
- Na chamada de três clientes, o teste verifica duas ligações WebRTC por cliente e no máximo três contextos de áudio ativos. As fontes são geradas para validação isolada repetível.
- **Desktop:** dois testes aprovados — configuração local/remota e persistência pendente ao encerrar.
- **Arranque:** teste aprovado com dados temporários.
- **Lint:** zero erros, nove avisos existentes de Fast Refresh.
- **`npm audit`:** zero vulnerabilidades assinaladas nas dependências JavaScript de produção e desenvolvimento. Não abrange uma auditoria automática das dependências Rust.
- **Compilação web e Windows aprovada.** Nota de saída do linker Rust, sem erro.

Imagens: [chamada de três](validation/group-call-three.png), [tema escuro](validation/settings-dark.png), [tema claro](validation/settings-light.png), [telemóvel](validation/settings-mobile.png), [servidor móvel](validation/server-settings-mobile.png).

## Pontos ainda necessários para publicação

1. Backend partilhado com HTTPS e `VITE_TUGA_API_URL`. Instalações locais têm contas e mensagens independentes. Configurar `TUGA_ALLOWED_ORIGINS`, incluindo as origens dos clientes desktop.
2. TURN publicado e validado, com domínio, certificado e portas. Exemplos em [deploy/coturn/README.md](../deploy/coturn/README.md).
3. Validação real do instalador com WebView2, dispositivos físicos, áudio do ecrã, notificações Windows, redes distintas e medições de CPU/RAM. Os testes no navegador não substituem essa validação.
4. Para escala, base de dados com transações, índices e paginação. O armazenamento JSON não oferece reversão completa de todas as mutações. Quotas, retenção e limpeza de uploads órfãos continuam pendentes.
5. Catálogo externo de GIFs, MFA, recuperação de conta, várias sessões, transferência de propriedade e moderação avançada continuam pendentes.
6. Assinatura do instalador, atualizações automáticas e ligação pública de transferência exigem configuração de distribuição. macOS/Linux não foram compilados ou validados.
7. Chamadas P2P têm custo crescente com o número de participantes; chamadas grandes e controlo central sobre clientes modificados requerem infraestrutura de media, como um SFU.

Os fluxos principais foram corrigidos e verificados. O projeto não deve ser apresentado como plataforma pública totalmente concluída sem fechar estes pontos.
