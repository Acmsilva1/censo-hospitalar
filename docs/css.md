# Especificações Técnicas: CSS Global e Pipeline Adaptativo

Esta documentação detalha a arquitetura de estilos que permite que as aplicações do sistema se ajustem automaticamente, utilizando variáveis CSS, o espaço de cor OKLCH e técnicas de escalonamento dinâmico.

## 1. Fundação: Design Tokens (OKLCH)

O sistema utiliza o padrão **Tailwind 4** com variáveis no espaço de cor **OKLCH**, que é superior ao HSL/RGB por manter a percepção de brilho constante entre diferentes matizes.

### Variáveis Core (:root)
```css
:root {
  /* Cores Base em OKLCH */
  --background: oklch(0.975 0.003 240);
  --foreground: oklch(0.248 0.010 260);
  --primary: oklch(0.690 0.140 145); /* Verde Hospitalar */
  --accent: oklch(0.930 0.020 200);
  
  /* Tokens de UI */
  --radius: 0.75rem;
  --font-sans: Inter, sans-serif;
  --tracking-normal: 0em;
}
```

### Por que isto funciona?
Ao usar variáveis no `:root`, qualquer componente que utilize `var(--primary)` será atualizado instantaneamente quando o tema mudar na tag `<html>`.

---

## 2. Orquestração de Temas (Theming)

O ThemeProvider em web/useTheme.jsx gerencia as classes no `document.documentElement`.

| Tema | Classe HTML | Efeito Principal |
| :--- | :--- | :--- |
| **Light** | `.light` | Fundo branco (`#ffffff`), variáveis claras. |
| **Dark (Padrão)** | `.dark` | Fundo OKLCH escuro, alto contraste. |
| **Dark Green** | `.dark-green` | Gradiente verde profundo (estilo PS). |
| **Dark Blue** | `.dark-blue` | Tons de azul marinho (estilo Leitos). |

### Técnica de Sobrescrita
```css
.dark-green {
  --background: oklch(0.176 0.031 151);
  --primary: oklch(0.704 0.164 146);
  /* Outras variáveis aqui... */
}
```

---

## 3. O Padrão "Pipeline" (Dashboard Dashboard View)

O "Pipeline" de alertas visualizado no **Controle Diário** utiliza uma paleta específica que pode ser replicada usando o arquivo web/features/controle-diario/styles/controle-diario-dashboard.css.

### Especificações do Pipeline:
*   **Fundo do Painel**: `#1e2030` (Dark Navy)
*   **Acento Live (Teal)**: `#2DE0B9`
*   **Acento Crítico (Red)**: `#E02D5F`
*   **Acento Urgente (Amber)**: `#E0B92D`

### Herança Automática
O CSS do Pipeline não redefine fontes; ele herda `--font-sans` do app principal, garantindo unidade visual mesmo sendo um módulo "independente".

---

## 4. Adaptação Automática de Tela (Responsive Scale)

Para garantir que a aplicação se ajuste a monitores de diferentes tamanhos (Kiosk/Wallboards), o sistema usa duas técnicas:

### A. Tipografia Fluida (Clamp)
Em vez de media queries fixas, usa-se `clamp()` para que o texto cresça proporcionalmente à largura da tela.
```css
.multi-monitor-extended-view {
  font-size: clamp(16px, 1.5vw, 24px) !important;
}
```

### B. Variável de Escala Local (`--unit-card-scale`)
Para redimensionar componentes inteiros (cards de unidade) em dashboards densos:
```css
.unit-card-typography {
  font-size: calc(1rem * var(--unit-card-scale, 1));
}
```

---

## 5. Como Replicar para Novos Projetos

1.  **Copie o index.css**: Ele contém todo o motor de Tailwind 4 e os tokens base.
2.  **Implemente o ThemeContext**: Crie um provider que alterne as classes no `<html>`.
3.  **Use Variáveis Semantic**: Nunca use cores fixas (ex: `bg-white`). Use `bg-[var(--background)]`.
4.  **Layout "Clip"**: Adote a regra de ouro:
    ```css
    html, body {
      max-width: 100vw;
      overflow-x: clip;
    }
    #root {
      min-width: 0; /* Essencial para flex/grid encolherem */
    }
    ```

## 6. Gadgets e Micro-Interações (O "Pulo do Gato")

Para replicar os "gadgets" visuais (efeitos de status, pulsações e ícones vivos), utilize os seguintes padrões de animação e componentes:

### A. Ícones de Status Vivos (Foguinho e Raio)
Usados nos badges de alerta para atrair a atenção sem causar fadiga visual.

```css
/* Animação para alertas Críticos (Flame/Foguinho) */
@keyframes foguinho {
  0%, 100% { opacity: 1; transform: scale(1); filter: brightness(1); }
  50% { opacity: 0.9; transform: scale(1.2); filter: brightness(1.25); }
}
.anim-foguinho {
  animation: foguinho 1s ease-in-out infinite;
  display: inline-block;
}

/* Animação para alertas Urgentes (Bolt/Raio) */
@keyframes raio {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.85; transform: scale(1.25); }
}
.anim-raio {
  animation: raio 0.9s ease-in-out infinite;
  display: inline-block;
}
```

### B. Cards de Alerta (Pipeline Style)
Os cards utilizam bordas duplas (esquerda e baixo) para indicar severidade.

*   **Crítico**: Fundo vermelho sólido (`bg-red-700`) + Sombra interna (`black/25`).
*   **Urgente**: Fundo escuro + Borda grossa em Amarelo/Âmbar (`#E0B92D`).

```css
/* Exemplo de estrutura para card Urgente */
.card-urgente {
  background: var(--dash-panel);
  border-left: 4px solid var(--dash-accent-urgent);
  border-bottom: 4px solid var(--dash-accent-urgent);
  border-radius: 1rem;
}
```

### C. Efeitos de Pulso e Glow
Para destacar itens que precisam de atenção imediata ou novos dados.

```css
/* Pulso de borda azul para novos itens */
@keyframes alertas-preview-pulsar-azul {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.45); }
  50% { box-shadow: 0 0 16px 4px rgba(96, 165, 250, 0.7); }
}

/* Brilho pulsante para cards inteiros */
@keyframes glow-pulse {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.15); }
}
```

### D. Relógio de Alta (Spin)
Ponteiro que gira indicando "tempo correndo" desde a alta.
```css
@keyframes alta-status-clock-hand-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin-slow {
  animation: alta-status-clock-hand-spin 2.5s linear infinite;
}
```
