# Pastas, fundos e chamadas — 14 de outubro de 2026

- Pastas: ícone de pasta com miniaturas, cor discreta, estado aberto acessível e bloco arredondado para os servidores.
- Fundos: editor com três cores, modos linear/radial, direção, intensidade, pré-visualização e reposição das cores. Preferências guardadas localmente.
- Chamadas de grupo: os grupos existentes permitem até 20 membros e a grelha mostra todos os participantes. Para chamadas com seis ou mais participantes, cada câmara envia vídeo até 20 fps, com resolução reduzida e 450 kbit/s por destinatário. A partilha respeita a qualidade/FPS escolhidos, com orçamento total de envio de 18 Mbit/s dividido pelos destinatários.
- Memória: eliminado o desenho duplicado do fundo no body e corrigida a desativação do blur nos fundos quando Poupar recursos está ativo. Referências a faixas locais são libertadas ao fechar os pares.

A arquitetura de chamadas continua a ser peer-to-peer: dez pessoas implicam nove ligações por pessoa. Não foi realizada uma chamada real com dez pessoas nem medida a RAM neste trabalho. Para grandes chamadas frequentes com vídeo de alta qualidade será necessário um servidor de media SFU. O tamanho do instalador em disco e o consumo de RAM durante utilização são medidas diferentes.

## Atualização do pedido

Login com composição mais preenchida, ilustração de conversa e animações de entrada/áudio/flutuação, respeitando movimento reduzido e pausa em segundo plano. Separadores de pontos e a etiqueta Sem atraso / Sem complicações removidos.

Editor com modo Luzes: três camadas radiais independentes, posição horizontal/vertical, intensidade por camada e extensão ajustável. Permite reproduzir a composição dos fundos predefinidos com pontos de luz; fundos de imagem continuam disponíveis.

Grupos privados passam a ter até 50 membros (49 convidados mais o criador), com validação no servidor para criação e convites. Canais de voz de servidores não tinham limite de 10 ou 19. A partir de 12 participantes, o vídeo enviado adapta-se a 15 fps, 250 kbit/s por destinatário e resolução reduzida. Não constitui validação de chamadas reais com 19 ou 50 pessoas. A arquitetura mesh continua a precisar de SFU para escalar com qualidade alta e consumo previsível.

Compilação concluída. Login conferido visualmente em computador e telemóvel. Consumo de RAM não medido; nenhum valor mínimo ou redução percentual é garantido.

## Conversas de grupo

Os grupos privados passam a abrir com a navegação das conversas, sem a árvore de canais de servidor. A lista de grupos mostra miniaturas, seleção atual, contagem de membros e participantes na chamada. A criação inclui pesquisa de contactos e contagem de selecionados.

O cabeçalho da conversa apresenta o nome do grupo, membros e chamada. Entrar ou iniciar pede confirmação e abre a chamada existente do grupo, com câmara e partilha de ecrã disponíveis. Uma faixa informa quem está na chamada enquanto se conversa por texto. Clicar no grupo na barra lateral regressa às mensagens sem abandonar a chamada.

Lista de membros num modal com fotos e adição por username para o criador; as permissões e limites continuam validados pelo servidor. Compilação e renderização visual do cabeçalho/modal concluídas. Não foi realizada uma chamada real entre dispositivos nesta alteração.

## Amigos, mascote e superfícies

Pedidos de amizade persistentes no servidor, com aceitação/recusa/cancelamento/remoção, adição por username exato, limite de 500 amigos e 100 pedidos recebidos e limitação de frequência. IDs de amigos e pedidos nunca entram nos perfis públicos. Bloquear remove a amizade e pedidos pendentes dos dois lados. Amigos aceites são visíveis como contactos mesmo sem um servidor partilhado.

Área Amigos na lista de conversas: pedidos, mensagens e adição aos grupos do criador através do seletor. A adição ao grupo usa o fluxo existente confirmado pelo servidor; não é um convite de grupo pendente de aceitação.

Nova mascote original vetorial e ícones Windows/navegador. Mascote no canto superior do login com olhos acompanhando o ponteiro; atualização limitada a um frame pendente e suspensa quando a página está oculta.

Definições com superfícies, espaços e controlos mais consistentes. Participantes nas chamadas usam fundo neutro independente do banner de perfil.

Renderização visual do login, amigos e definições conferida com dados de demonstração. Sintaxe do servidor e compilação verificadas. Fluxos de amizade entre contas reais e chamadas reais não foram executados nesta alteração; não é uma auditoria completa de todos os bugs do projeto.

## Fundo da chamada e axolote

Definições / Voz e áudio: cartões neutros, banner individual de cada participante ou fundo personalizado (cor, imagem reduzida, gradiente linear/radial/luzes). Preferência local por dispositivo, aplicada imediatamente nos grupos, servidores e chamadas diretas. As imagens são processadas pelo mesmo leitor de imagens da aplicação e reduzidas a 1280 px. Escolher o banner é opcional; o modo neutro mantém-se por predefinição.

Mascote redesenhada como um axolote, com verde, vermelho e dourado inspirados em Portugal. Removidos os eventos do ponteiro. Animação de respiração subtil, guelras suaves e piscar ocasional; respeita movimento reduzido e pausa em segundo plano. Ícones da aplicação e navegador atualizados.

Compilação e conferência visual do desenho e editor de fundo realizadas. Não foram validadas chamadas reais neste trabalho.

## Mascote reativa e fundos sem fotografias

Removido o seletor de imagens dos fundos da chamada. Fotografias anteriormente guardadas e banners de perfil com imagem são ignorados na vista da chamada; continuam disponíveis cores sólidas e gradientes.

Nova figura original arredondada com pequenos apêndices e mãos. No formulário, reage ao foco e escrita, à mudança entre entrar/registar, à visibilidade da palavra-passe, ao envio pendente e aos erros. Sem acompanhamento do ponteiro. Reações respeitam movimento reduzido e a pausa em segundo plano. Conferência visual da reação à palavra-passe e compilação concluídas; não foram executados novos testes de autenticação.

## Mascote final baseada no primeiro ícone

Recuperado o primeiro ícone de conversa do Tuga no produto, navegador e ficheiros de ícones da aplicação. Mascote separada baseada na mesma figura, com pernas e mãos, de pé no canto superior da caixa de login. Pequenos passos no mesmo sítio, movimento suave, piscar e reações ao formulário. Mantidas as preferências de movimento reduzido e a pausa em segundo plano. A pré-visualização do perfil mantém o banner integral e o avatar sobreposto, sem o preenchimento que tinha sido aplicado às caixas gerais das definições.

Compilação e conferência visual da posição da mascote concluídas.

## Perfil fiel e poses com contexto

A pré-visualização das definições e o perfil real usam agora o mesmo componente ProfileCard. Banner, arredondamento, avatar sobreposto, cargo, biografia e data de entrada seguem a mesma apresentação, com os campos atuais da edição. Corrigido o preenchimento aplicado indevidamente ao cartão e o colapso da margem do avatar.

A mascote calcula a direção do campo ou botão focado, orienta os olhos e inclina o corpo. Acrescentadas poses de atenção, cumprimento e espera, além das reações anteriores. Não segue o movimento livre do ponteiro. Compilação concluída e renderização conferida com dados de demonstração.
