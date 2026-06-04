(module
  (func $handleCommand (export "handleCommand") (param $cmd i32) (result i32)
    (local $result i32)
    i32.const 0
    local.set $result
    ;; === MATCH ===
    local.get $cmd
    i32.const 0
    i32.eq
    if
    i32.const 1
    local.set $result
    else
    local.get $cmd
    i32.const 1
    i32.eq
    if
    i32.const 2
    local.set $result
    else
    local.get $cmd
    i32.const 2
    i32.eq
    if
    i32.const 255
    local.set $result
    end
    end
    end
    ;; === END MATCH ===
    local.get $result
    return
  )
  (func $getMaxSpeed (export "getMaxSpeed") (result i32)
    i32.const 255
    return
  )
)