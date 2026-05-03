# Mapa do Brasil no Frontend (Guia de Reuso)

Este projeto renderiza o mapa em:

- `web/features/ps/components/CommandCenterPanel/GeoHeatmap.jsx`

## 1) Como o mapa é criado

- Base vetorial: `web/public/geo/br-states.json` (GeoJSON dos estados)
- Projeção SVG: `d3-geo` (`geoMercator` + `geoPath`)
- Render: `<svg viewBox="0 0 1000 700">` com:
  - `<path>` por estado (coroplético por valor)
  - `<text>` para UF + valor no centróide
- Dados: endpoint `/ps/resumo-unidades`, agregados por UF

## 2) Onde está o “CSS” do mapa

O visual não está em um `.css` dedicado. Ele vem de 3 fontes:

1. Classes utilitárias (Tailwind) no JSX  
2. `style={{ ... }}` inline no JSX  
3. `<style>` embutido no componente para animação

### 2.1 Classes utilitárias principais

- Card principal:
  - `p-4 md:p-6 border-0 flex flex-col min-h-0`
- Layout mapa + legenda:
  - `flex` + responsivo (`flex-col` mobile, `flex-row` desktop)
  - `gap-4 md:gap-6 w-full`
- Bloco da legenda lateral:
  - `overflow-y-auto rounded-lg p-4`
- Itens da legenda (UF):
  - `mb-4 pb-4 rounded-lg p-2 border-b`

### 2.2 Estilos inline importantes

- Fundo/tema do card (light/dark) é todo definido por inline style:
  - `background`
  - `border`
  - `boxShadow`
  - `borderRadius`
- Estado no SVG:
  - `fill` dinâmico pela escala de cor
  - `stroke`/`strokeWidth`
  - estado com maior valor recebe glow/vermelho
- Rótulos (UF e valor):
  - `paintOrder`, `stroke`, `drop-shadow` para legibilidade

### 2.3 Animação embutida

No próprio `GeoHeatmap.jsx` existe:

```css
@keyframes pulse-state {
  0%, 100% { opacity: 1; filter: brightness(1); }
  50% { opacity: 0.85; filter: brightness(1.3); }
}
.pulsing-state {
  animation: pulse-state 2s ease-in-out infinite;
  transform-origin: center;
}
```

Essa classe é aplicada ao estado de maior volume.

## 3) Paleta de cores usada

Vem de:

- `web/features/ps/components/CommandCenterPanel/shared.jsx`
- objeto `MED_SENIOR_COLORS`

Exemplos:

- `LIME_GREEN: #94c11e`
- `MEDIUM_GREEN: #49a455`
- `DARK_GREEN: #327846`

No mapa, a escala coroplética é definida no próprio `GeoHeatmap.jsx` por `colorStops` (verde → amarelo → laranja → vermelho escuro).

## 4) Efeito de brilho externo (wrapper)

O componente usa `GlowCard` (`shared.jsx`), que injeta um `GlowEffect` atrás do conteúdo:

- não altera geometria do mapa
- altera percepção visual do card (halo/energia)

## 5) Checklist para portar para outro projeto

1. Copiar `GeoHeatmap.jsx`
2. Garantir dependências:
   - `d3-geo`
   - `lucide-react`
   - React
3. Copiar `shared.jsx` (ou recriar `MED_SENIOR_COLORS` e `GlowCard`)
4. Levar `br-states.json` para `/public/geo/br-states.json`
5. Ajustar fetch de dados (espera lista de unidades com UF)
6. Manter o bloco `<style>` da animação `pulse-state`
7. Se não usar Tailwind, converter classes utilitárias para CSS tradicional

## 6) Estrutura mínima de dados esperada

Cada unidade deve permitir derivar:

- `uf` (sigla do estado)
- `hoje` (volume atual)
- `ativos` (opcional, para legenda)

Com isso, o componente agrega por UF e colore o mapa automaticamente.
