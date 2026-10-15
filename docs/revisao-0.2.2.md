# Tuga 0.2.2 — revisão da interface e dos fluxos

Revisão de 13 de outubro de 2026. Os testes usam contas, ficheiros e bases de dados temporários; os dados existentes não foram substituídos.

## Definições

- Navegação organizada por conta, preferências e aplicação, com pesquisa e identificação do perfil.
- Cabeçalhos, espaçamentos, cartões, foco e controlos revistos nos temas claro e escuro.
- Navegação móvel com gestão de foco e sem elementos ocultos acessíveis por teclado.
- Confirmação antes de abandonar alterações de perfil; os valores guardados são os devolvidos pelo servidor.
- Contraste da cor escolhida ajustado para textos e botões; limites de preferências numéricas normalizados.
- Menus dos servidores uniformizados; gestão dos canais adaptada ao telemóvel.

## Correções funcionais

- Pedidos de alteração de perfil, canais e cargos correlacionados com a confirmação do servidor. As alterações confirmadas são persistidas antes da resposta.
- Nomes de canais normalizados, cargos criados selecionados para edição e permissões com estados herdar/permitir/bloquear.
- Imagens de perfil e servidor validadas e redimensionadas; GIFs pequenos preservam a animação. Correção do ícone truncado durante a criação de servidores.
- Servidores novos privados por predefinição; administração da plataforma mantém acesso autorizado.
- Mensagens, ficheiros e votações aguardam confirmação. Falhas de publicação conservam o rascunho; falhas de upload conservam o ficheiro e a legenda.
- Rascunhos separados por conta e conversa; limpeza das pré-visualizações de ficheiros.
- Confirmações de ações destrutivas, bloqueio e alterações administrativas com apresentação de erros.
- Editor de servidor preservado ao mudar a largura da janela; navegação móvel e recuperação de rotas desconhecidas corrigidas.
- Definições antigas deixam de reabrir depois de terminar sessão; indicadores de ligação acompanham a ligação real.
- Publicação em canais de avisos respeita também os cargos com permissão de administrador.
- Proteção contra ofertas WebRTC repetidas e substituição de pistas numa ligação já encerrada.
- Removida a indicação incorreta de encriptação ponta a ponta para mensagens armazenadas no servidor.

## Âmbito e evidência

Inspeção dos módulos centrais de autenticação, API/WebSocket, armazenamento, permissões, perfis, mensagens, servidores, chamadas, definições, navegação, arranque e integração desktop. A compilação e o lint abrangem também os componentes partilhados. Isto não demonstra ausência de todos os bugs em todas as combinações possíveis.

- Auditoria de integração: permissões, canais ocultos, anexos, bloqueios, sessões, alterações de conta e administração.
- Navegador isolado: registo/login, definições claras/escuras/móveis, perfis, criação de servidores, canais/cargos, mensagens, falhas de envio/upload e votações.
- Chamadas entre dois clientes: microfone, câmara, ecrã e áudio separados, receção de áudio/vídeo, volumes, mute/deafen, atalhos, notificações simuladas, destaque de quem fala, fotografias e definições em ecrã inteiro.
- Arranque do `start.bat` validado com dados temporários.
- Lint: zero erros e nove avisos existentes de Fast Refresh.
- Auditoria das dependências de produção: zero vulnerabilidades assinaladas.
- Compilação web e instaladores Windows 0.2.2 gerados. Pacote principal aproximadamente 597 KB, 168 KB comprimidos; definições carregadas separadamente.

Imagens da validação: [tema escuro](validation/settings-dark.png), [tema claro](validation/settings-light.png), [telemóvel](validation/settings-mobile.png), [servidor no telemóvel](validation/server-settings-mobile.png), [chamada](validation/server-call.png).

## Limites e trabalho ainda pendente

- Equipamento físico, redes externas, TURN público e notificações reais do Windows precisam de validação no ambiente de utilização. Os testes de chamadas usam fontes de áudio e vídeo geradas.
- O backend partilhado com HTTPS e o serviço TURN precisam de publicação e configuração próprias; instalações locais mantêm bases de dados independentes.
- O armazenamento JSON não oferece transações completas com reversão de todas as alterações nem substitui uma base de dados adequada para escala. Quotas, retenção e limpeza de uploads órfãos continuam pendentes.
- A pesquisa num catálogo externo de GIFs não está integrada; ligações diretas a media e favoritos estão disponíveis.
- MFA, recuperação de conta, gestão avançada de sessões e alguns fluxos avançados de comunidades continuam pendentes, conforme os relatórios anteriores.
- Alguns fluxos secundários, incluindo reordenação e adição de membros, ainda usam atualização otimista e não têm a mesma cobertura de confirmação dos fluxos revistos.
- Não existe garantia de entrega exatamente uma vez quando a ligação se perde depois da publicação e antes da confirmação.
- Chamadas P2P não permitem impor todas as restrições a clientes modificados; controlo central de media requer infraestrutura própria, como um SFU.
- Há um aviso de desenvolvimento de PostCSS relativo à opção `from`; a compilação e os fluxos visuais verificados passaram.

Relatórios anteriores permanecem como histórico: [auditoria](auditoria-2026-10-13.md), [implementação](implementacao-0.2.0.md), [correções 0.2.1](correcoes-0.2.1.md).
