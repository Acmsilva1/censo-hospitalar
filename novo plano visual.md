# Novo Plano Visual — Leitos com Imagem 3D

## Objetivo
Substituir os blocos geométricos (BoxGeometry) que representam os leitos por uma imagem isométrica de uma cama hospitalar real (arquivo `cama.png`), mantendo o sistema de cores por status (Azul = Ocupado / Verde = Livre) e os rótulos com o número do leito.

## O que será feito

### 1. Asset — `cama.png`
- Imagem de uma cama hospitalar em perspectiva isométrica top-down, fundo transparente (PNG).
- Salva na raiz do projeto e copiada para `apps/web-shell/public/` para ser servida pelo Vite.

### 2. Substituição do `BedModel`
- Remover a geometria de caixa (frame + colchão + travesseiro).
- Adicionar um **BoxGeometry** com array de 6 materiais — a textura `cama.png` é aplicada somente na face superior do cubo.
- As laterais do cubo recebem a cor de status (Azul = Ocupado / Verde = Livre).
- O pulso de animação (`Math.sin`) permanece no material da face de cima.

### 3. Rótulos
- Número do leito continua como `SpriteLabel` flutuando acima da cama, igual ao atual.

## Resultado esperado
A maquete fica mais realista visualmente pois ao invés de blocos genéricos, cada slot mostra a textura da cama no topo. O halo de cor garante que o status ainda seja legível.

## Rollback
Se o visual ficar ruim (imagem pixelada, mal encaixada na perspectiva ou difícil de ler), revertemos para a versão de blocos geométricos com um único `git revert`, pois as mudanças são isoladas em um commit.

---

# Plano Visual — PS (Pronto Socorro) sem Leitos Individuais

## Contexto
O Pronto Socorro não trabalha com leitos numerados individualmente como as internações e UTI. Em vez disso, o fluxo é organizado por **setores funcionais** (etapas de atendimento). Cada setor tem uma taxa de ocupação, mas não um leito específico.

## Solução: Módulo de Setores 3D por Fluxo de Atendimento

Em vez de uma grade de camas, o PS terá uma **visão de blocos setoriais** no mesmo estilo 3D da fundação do prédio. Cada setor ocupa um espaço proporcional no andar e exibe:
1. Um **ícone ilustrado** (gerado via `generate_image` e aplicado como textura) representando o setor visualmente.
2. Um **indicador de ocupação** (percentual) exibido como `SpriteLabel` flutuando acima do bloco.
3. Uma **cor de status dinâmica** no halo do bloco: Verde < 70%, Amarelo 70–90%, Vermelho > 90%.

---

## Setores e Seus Ícones

| Setor | Descrição do Ícone | Arquivo |
|---|---|---|
| **Triagem** | Enfermeira com estetoscópio, uniforme azul, expressão receptiva | `setor_triagem.png` |
| **Consulta** | Médico de jaleco com prancheta, postura de atendimento | `setor_consulta.png` |
| **Laboratório** | Equipamento de análise laboratorial + tubo de soro/seringa | `setor_laboratorio.png` |
| **Exames** | Máquinas de RX, TC (tomógrafo) em perspectiva isométrica | `setor_exames.png` |
| **Medicação** | Enfermeira com bandeja de medicamentos, curativo e seringa | `setor_medicacao.png` |
| **Reavaliação** | Médico com símbolo de retorno (seta circular), indicando paciente em retorno | `setor_reavaliacao.png` |

---

## Implementação Técnica

### Componente: `PSFloorView3D`
- Recebe a lista de setores com `{ name, occupied, total }` sem necessidade de cama individual.
- Cada setor é renderizado como um **bloco 3D** (`BoxGeometry`) com:
  - A textura do ícone do setor na **face superior**.
  - Cor lateral dinâmica conforme ocupação:
    - Verde: `< 70%`
    - Amarelo: `70% – 90%`
    - Vermelho: `> 90%`
  - `SpriteLabel` com o nome + percentual flutuando acima.
- Blocos organizados em grid horizontal sobre a mesma fundação procedural 3D já existente.

### Mapeamento de Setores
- Nome do setor vindo da API será comparado com palavras-chave (ex: `triagem`, `consulta`, `lab`, `exame`, `medicação`, `reavaliação`) para selecionar o ícone correto.
- Se não reconhecido, usa um ícone genérico de cruz médica.

### Animação
- Blocos com ocupação crítica (> 90%) terão um pulso vermelho suave no halo, igual ao pulso das camas nos andares de internação.

---

## Assets a Gerar
Cada ícone será gerado com o `generate_image` em estilo **flat isométrico 3D cartoon**, fundo transparente, paleta médica clean. Dimensão: 512×512px.

## Próximos Passos
1. Gerar os 6 assets de setor.
2. Criar o componente `PSFloorView3D`.
3. Detectar se o andar selecionado é PS e usar o componente correto.
4. Integrar ao `VisaoHospitalar.tsx`.
