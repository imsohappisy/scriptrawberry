(module
  (memory (export "memory") 1)
  (global $__stack_ptr (mut i32) (i32.const 1024))
  (func $compute (export "compute") (param $x i32) (param $y i32) (result i32)
    (local $result i32)
    i32.const 0
    i32.const 7
    i32.and
    local.set $result
    local.get $x
    i32.const 4
    i32.gt_u
    if
    i32.const 7
    i32.const 7
    i32.and
    local.set $result
    else
    local.get $x
    local.get $y
    i32.add
    i32.const 7
    i32.and
    local.set $result
    end
    local.get $result
    return
  )
  (func $countUp (export "countUp") (result i32)
    (local $total i32)
    (local $i i32)
    i32.const 0
    local.set $total
    ;; === UNROLLED for i in 0..8 ===
    ;; --- iteration i = 0 ---
    i32.const 0
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 1 ---
    i32.const 1
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 2 ---
    i32.const 2
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 3 ---
    i32.const 3
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 4 ---
    i32.const 4
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 5 ---
    i32.const 5
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 6 ---
    i32.const 6
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; --- iteration i = 7 ---
    i32.const 7
    local.set $i
    local.get $total
    i32.const 1
    i32.add
    local.set $total
    ;; === END UNROLLED ===
    local.get $total
    return
  )
  (func $makeObject (export "makeObject") (result i32)
    (local $obj__ptr i32)
    ;; allocate struct ObjectState (4 bytes)
    global.get $__stack_ptr
    i32.const 4
    i32.sub
    global.set $__stack_ptr
    global.get $__stack_ptr
    local.set $obj__ptr
    ;; store field 'id' at offset 0
    local.get $obj__ptr
    i32.const 42
    i32.const 65535
    i32.and
    i32.store offset=0
    ;; store field 'active' at offset 2
    local.get $obj__ptr
    i32.const 1
    i32.const 1
    i32.and
    i32.store offset=2
    ;; store field 'category' at offset 2
    local.get $obj__ptr
    i32.const 3
    i32.const 7
    i32.and
    i32.store offset=2
    ;; store field 'priority' at offset 2
    local.get $obj__ptr
    i32.const 10
    i32.const 15
    i32.and
    i32.store offset=2
    local.get $obj__ptr
    i32.load offset=0
    return
  )
)