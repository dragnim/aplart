⍝ Controls
size←32
repeat←8
offset←3

⍝ Add each row number to each column number, then fold by the repeat
repeat|(⍳size)∘.+offset×⍳size
