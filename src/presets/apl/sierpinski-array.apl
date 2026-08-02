⍝ Controls
size←64
repeats←1
invert←0

⍝ Row and column numbers, counting from zero
n←¯1+⍳size

⍝ Every number written out in binary
bits←(16⍴2)⊤repeats×n

⍝ Filled where no binary digit is shared
invert≠0=(⍉bits)+.×bits
