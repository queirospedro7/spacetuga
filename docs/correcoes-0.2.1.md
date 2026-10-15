# Tuga 0.2.1 — correções de chamadas e gravação

## Correções

- Os modais usam uma camada superior à chamada; menus, confirmações e sugestões mantêm as suas camadas acima dos modais. Em ecrã completo, estas janelas são colocadas dentro do elemento em ecrã completo, mantendo-se visíveis e utilizáveis.
- Dispositivos com identificadores vazios, devolvidos quando faltam permissões, são excluídos dos seletores para evitar a falha que deixava a tela vazia. Ausência de suporte de media é apresentada como erro no modal.
- As definições do servidor aguardam uma confirmação identificada do backend. O backend valida os campos antes de alterar o servidor e confirma apenas após escrita no disco. Erros e falhas de ligação são apresentados; alterações rejeitadas não são aplicadas parcialmente.
- Atualizações do servidor em segundo plano deixam de repor os campos enquanto o utilizador está a editar. Imagens e cargo predefinido que não foram alterados não são reenviados desnecessariamente.
- A lista lateral de participantes da chamada utiliza a foto de perfil. A chamada direta de voz também apresenta a foto do contacto quando não existe vídeo.
- A atividade do microfone é medida em cada participante. O respetivo quadrado recebe um contorno verde com transição e um pequeno intervalo de retenção para evitar intermitência. O áudio da partilha não ativa esse destaque; mute desativa-o. A captura local atualiza-se também ao trocar de microfone.

## Verificação

- TypeScript e compilação de produção aprovados.
- Auditoria de permissões aprovada, incluindo rejeição de alterações inválidas sem gravação parcial.
- Teste com dois clientes isolados aprovado: modal acima da chamada, modal e seleção em ecrã completo, dispositivos com identificadores vazios, gravação confirmada no ficheiro, edição preservada durante atualização em segundo plano, foto na lista e destaque local/remoto ao falar, removido ao silenciar.
- `start.bat` verificado com dados temporários.
- Dependências npm sem vulnerabilidades assinaladas. ESLint sem erros; os nove avisos de Fast Refresh existentes permanecem.
- Backend local reiniciado com versão 0.2.1. Instaladores Windows atualizados para esta versão.

Os testes de media usam fontes geradas e não captam dispositivos pessoais. A validação em redes diferentes, com dispositivos físicos e TURN público, mantém os limites documentados na revisão anterior.
