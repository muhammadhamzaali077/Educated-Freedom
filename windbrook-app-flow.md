# Windbrook Portal — App Flow

## High-level user flow (the path Maryann takes)

```mermaid
flowchart TD
    A[Maryann opens portal URL] --> B[Login screen]
    B --> C[Dashboard]
    C --> D{Pick household}
    D --> E[Cole]
    D --> F[Lipski]
    D --> G[Park-Rivera]
    E --> H[Client detail page]
    F --> H
    G --> H
    H --> I[Click 'Generate Report']
    I --> J[Quarterly checklist form]
    J --> K[Form pre-fills with last quarter's values]
    K --> L[Maryann updates current quarter values]
    L --> M{All fields filled?}
    M -->|No| L
    M -->|Yes| N[Click Generate]
    N --> O[Server saves snapshot + computes totals]
    O --> P[Report detail page]
    P --> Q{What next?}
    Q -->|Edit layout| R[Drag-and-drop bubbles]
    R --> S[Layout auto-saves per household]
    S --> P
    Q -->|Download PDF| T[Server renders SVG to PDF]
    T --> U[PDF downloads to browser]
    Q -->|Export to PowerPoint| V[Server screenshots SVG to PNG]
    V --> W[PNG embedded in PPTX slide]
    W --> X[PPTX downloads to browser]
    Q -->|Export to Canva| Y[Manual: drag PDF into Canva]
    U --> Z[Andrew uses in client meeting]
    X --> Z
    Y --> Z

    style A fill:#9DC8E5,color:#0A1F3A
    style Z fill:#B8956A,color:#FFFFFF
    style P fill:#0A1F3A,color:#FFFFFF
    style N fill:#1F9E4D,color:#FFFFFF
```

## System architecture (what happens behind a click)

```mermaid
flowchart LR
    subgraph Browser
        UI[User clicks button]
    end

    subgraph Web Layer
        ROUTE[Hono route handler]
    end

    subgraph Data Layer
        DB[(SQLite database)]
        SNAP[Frozen snapshot JSON]
    end

    subgraph Calculation Layer
        CALC[Pure TypeScript<br/>locked calculation rules<br/>unit-tested]
    end

    subgraph Renderer Layer
        SVG[SVG renderer<br/>hardcoded coordinates<br/>matches reference]
    end

    subgraph Export Layer
        PW[Playwright<br/>headless Chromium]
        PPTX[pptxgenjs]
        CANVA[Canva Connect API]
    end

    UI --> ROUTE
    ROUTE --> DB
    DB --> SNAP
    SNAP --> CALC
    CALC --> SVG
    SVG --> PW
    PW -->|page.pdf| PDF[PDF file]
    PW -->|page.screenshot| PNG[PNG buffer]
    PNG --> PPTX
    PPTX --> PPTXFILE[PPTX file]
    PDF --> CANVA
    CANVA -.->|API blocked on Free tier| MANUAL[Fallback: manual upload]
    PDF --> UI
    PPTXFILE --> UI

    style DB fill:#9DC8E5,color:#0A1F3A
    style SVG fill:#1F9E4D,color:#FFFFFF
    style PW fill:#0A1F3A,color:#FFFFFF
    style CANVA fill:#B8956A,color:#FFFFFF
```

## Report generation pipeline (the core sequence)

```mermaid
sequenceDiagram
    participant U as Maryann
    participant B as Browser
    participant S as Server
    participant D as SQLite
    participant C as Calc Layer
    participant R as SVG Renderer
    participant PW as Playwright/Chromium
    participant P as pptxgenjs

    U->>B: Fill checklist, click Generate
    B->>S: POST /clients/:id/reports
    S->>D: Save snapshot (frozen JSON)
    S->>C: Compute totals from snapshot
    C-->>S: Excess, Grand Total, Target, etc.
    S->>D: Create report row, status=draft
    S-->>B: Redirect to /reports/:id
    B->>S: GET /reports/:id
    S->>D: Load report + snapshot
    S->>R: renderSacsSvg(snapshot)
    R-->>S: SVG strings (page1, page2)
    S-->>B: HTML page with inline SVG preview

    Note over U,B: User reviews report

    U->>B: Click Download PDF
    B->>S: POST /reports/:id/export/pdf
    S->>R: renderSacsSvg(snapshot)
    R-->>S: SVG
    S->>PW: page.pdf(svg)
    PW-->>S: PDF buffer
    S-->>B: PDF download

    Note over U,B: ...or click Export PPTX

    U->>B: Click Export PowerPoint
    B->>S: POST /reports/:id/export/pptx
    S->>R: renderSacsSvg(snapshot)
    R-->>S: SVG
    S->>PW: page.screenshot(svg)
    PW-->>S: PNG buffer
    S->>P: addSlide + addImage(PNG)
    P-->>S: PPTX buffer
    S-->>B: PPTX download
```

## Data state transitions

```mermaid
stateDiagram-v2
    [*] --> Empty: Household created
    Empty --> Draft: First Generate clicked
    Draft --> Generated: Calculations complete
    Generated --> Exported: PDF/PPTX downloaded
    Generated --> Edited: Layout changed
    Edited --> Generated: Auto-saved
    Exported --> Historical: Time passes
    Historical --> Draft: Duplicate as new for next quarter
    note right of Generated
        Snapshot is frozen
        Numbers can't drift
        Same report regenerates identically
    end note
```
