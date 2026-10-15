# Correções de 14 de outubro de 2026

## Interface e chamadas

- Escolha de qualquer cor HEX para o banner do perfil, tanto no editor rápido como nas definições. O servidor aceita apenas cores HEX válidas e mantém a validação de imagens e gradientes.
- Banners usam propriedades de fundo separadas, evitando o conflito entre `background`, `backgroundImage` e `backgroundPosition`.
- A fotografia do próprio utilizador é obtida do perfil atual na administração dos membros; os outros membros usam os perfis visíveis autorizados.
- Remover a imagem do servidor envia e guarda uma string vazia. Antes, o cliente e o servidor repunham a imagem anterior.
- Clicar novamente num canal de voz ligado seleciona o canal e mostra a chamada, sem executar a saída.
- A partilha tem tamanhos distintos: normal, expandida dentro da chamada e oculta, com botão para voltar a mostrar. Ecrã completo continua como opção separada.
- Microfone e câmara têm opções predefinidas válidas, sem itens de seleção com valor vazio. A câmara predefinida não é enviada como identificador físico.
- Recusar ou cancelar a autorização da câmara mostra uma mensagem compreensível; a aplicação não pode conceder essa autorização pelo utilizador.
- Diálogos sem descrição adicional declaram essa ausência; diálogos que incluem `DialogDescription` mantêm a associação acessível.

## Organização e mensagens

- Pastas disponíveis na barra de servidores: criar pelo menu de contexto ou arrastar um servidor para outro; renomear, recolher, adicionar e retirar servidores.
- Pastas guardadas por conta neste dispositivo, com validação de dados locais e prevenção de membros duplicados. Pastas de versões anteriores com chave global não são importadas para evitar misturar contas.
- Confirmação de terminar sessão disponível no perfil e nas definições.
- Seletores encontrados na interface usam o componente visual partilhado; não existem elementos HTML `select` simples no código da interface.
- O erro de limite de pedidos apresenta uma instrução para aguardar e tentar novamente nos pedidos confirmados, autenticação e criação de servidores.

## Avisos externos e esperados

- `contentscript.js`, `ObjectMultiplex` e os listeners de streams mencionados no pedido não pertencem aos ficheiros do Tuga. São compatíveis com scripts injetados por uma extensão; confirmar a origem num perfil de navegador sem extensões. A aplicação não altera os limites de listeners dessas extensões.
- A recomendação de instalar React DevTools é informativa em desenvolvimento.
- O aviso `beforeinstallprompt.preventDefault()` resulta do adiamento do convite automático para usar o botão de instalação da aplicação. O botão chama `prompt()` por ação do utilizador; não indica uma falha de chamada.

## Distribuição e limites

Verificação concluída: auditoria de permissões e alterações de conta aprovada, incluindo cor HEX do banner e remoção da imagem do servidor; fluxos completos no navegador aprovados, incluindo chamadas e cancelar/confirmar a saída de sessão. Compilação TypeScript e web aprovada.

Compilação da interface e atualização do instalador Windows 0.2.2. Os dados existentes são preservados. Os testes de integração usam dados temporários. Chamadas com equipamento físico, permissões do sistema e redes externas precisam de validação no ambiente de utilização. O pacote principal excede o aviso de 600 KB; a compilação continua válida.
