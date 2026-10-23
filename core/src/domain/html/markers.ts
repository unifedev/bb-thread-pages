// The attributes that mark what the host put into a served document, with no parser behind them, so the kernel can read them too (02 R4.1, R4.66; 07 R5.92).

/** The attribute that marks the kernel's script element; a page never carries it itself. 02 R4.1 */
export const KERNEL_ATTRIBUTE = "data-thread-page-kernel";

/** The attribute that marks a contributor's page script, its value the contributor's id. 07 R5.92 */
export const CONTRIBUTOR_SCRIPT_ATTRIBUTE = "data-thread-page-contributor";
