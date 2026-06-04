(module
  (func $square (export "square") (param $x i32) (result i32)
    local.get $x
    local.get $x
    i32.mul
    return
  )
  (func $add (export "add") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
    return
  )
  (func $sumOfSquares (export "sumOfSquares") (param $a i32) (param $b i32) (result i32)
    local.get $a
    call $square
    local.get $b
    call $square
    call $add
    return
  )
  (func $main (export "main") (result i32)
    (local $result i32)
    i32.const 3
    i32.const 4
    call $sumOfSquares
    local.set $result
    local.get $result
    return
  )
)