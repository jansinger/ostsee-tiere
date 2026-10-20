<script lang="ts">
	import { dropzoneBaseClass } from '#lib/form/fields/dropzone.ts';
	import type { DropzoneProps } from '#lib/types/index.ts';
	import type { ChangeEventHandler, DragEventHandler } from 'svelte/elements';

	type HTMLInputElementWithFiles = HTMLInputElement & { files: FileList | null };

	let {
		children,
		files = $bindable<FileList | null>(),
		class: className,
		onDrop,
		onDragOver,
		onChange,
		...restProps
	}: DropzoneProps = $props();

	const theme = 'nord';

	let inputElement: HTMLInputElement;

	const handleDrop: DragEventHandler<HTMLLabelElement> = function (this: Window, event) {
		event.preventDefault();

		if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
			files = event.dataTransfer.files;
			if (inputElement) {
				inputElement.files = event.dataTransfer.files;
			}
		}

		if (onDrop) {
			onDrop.call(this, event);
		}
	};

	const handleDragOver: DragEventHandler<HTMLLabelElement> = function (this: Window, event) {
		event.preventDefault();
		if (onDragOver) {
			onDragOver.call(this, event);
		}
	};

	const handleChange: ChangeEventHandler<HTMLInputElementWithFiles> = function (
		this: Window,
		event
	) {
		if (onChange) {
			onChange.call(this, event);
		}
	};
</script>

<label
	class={`${dropzoneBaseClass} ${theme} ${className ?? ''}`}
	ondrop={handleDrop}
	ondragover={handleDragOver}
>
	{@render children()}

	<input
		{...restProps}
		bind:files
		bind:this={inputElement}
		onchange={handleChange}
		type="file"
		class="hidden"
	/>
</label>
