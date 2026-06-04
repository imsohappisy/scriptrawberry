(module
  (func $add (export "add") (param $a i32) (param $b i32) (result i32)
    (local $x i32)
    local.get $a
    local.get $b
    i32.add
    i32.const 7
    i32.and
    local.set $x
    local.get $x
    return
  )
)