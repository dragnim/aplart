⍝ Controls
width←121
generations←80
rule←30
seed←0

⍝ The eight outcomes the rule number encodes, in neighbourhood order
rb←⌽(8⍴2)⊤rule

⍝ Start from a single live cell in the middle.
⍝ A seed above zero scatters more, always the same way for the same seed.
start←width⍴0
start[⌈width÷2]←1
start←start∨(0≠seed)∧2|⌊10000×1|seed×0.6180339887×⍳width

⍝ Each new row is the rule read off every cell and its two neighbours
grow←{r←,¯1↑⍵ ⋄ ⍵⍪rb[1+2⊥↑(1⌽r)r(¯1⌽r)]}
grow⍣generations⊢1 width⍴start
