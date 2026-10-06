#[allow(dead_code)]
mod model;

pub use model::calculate_json;
#[cfg(not(target_arch = "wasm32"))]
pub use model::refresh_json;

#[unsafe(no_mangle)]
pub extern "C" fn alloc(length: usize) -> *mut u8 {
    Box::into_raw(vec![0_u8; length].into_boxed_slice()) as *mut u8
}

#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn dealloc(pointer: *mut u8, length: usize) {
    unsafe {
        drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(
            pointer, length,
        )))
    };
}

#[unsafe(no_mangle)]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "C" fn calculate(pointer: *const u8, length: usize) -> u64 {
    let request = unsafe { std::slice::from_raw_parts(pointer, length) };
    let response = calculate_json(request).into_bytes().into_boxed_slice();
    let length = response.len() as u64;
    let pointer = Box::into_raw(response) as *mut u8 as u64;
    (length << 32) | pointer
}
