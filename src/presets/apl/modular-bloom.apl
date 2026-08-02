⍝ Controls
size←64
modulus←17
multiplier←1

⍝ Multiply every number by every other, then fold by the modulus
modulus|multiplier×∘.×⍨⍳size
