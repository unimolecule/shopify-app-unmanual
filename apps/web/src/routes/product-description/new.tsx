import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { uploadFile } from "@/apis/files";
import { throwAppWebError as throwError } from "../../../internal";

export const Route = createFileRoute("/product-description/new")({
  component: NewProductExport,
});

function NewProductExport() {
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const files = getSelectedFiles(form);

    if (files.length === 0) {
      showToast("Select at least one image before saving.", { isError: true });
      return;
    }

    if (!validateSelectedFiles(files)) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSaving(true);
    setLoading(true);

    try {
      const responses = await Promise.all(
        files.map((file) => uploadFile(file, controller.signal)),
      );
      const uploadedFiles = responses.map((response) => response.data);
      if (uploadedFiles.some((file) => !file)) {
        throwError("Upload response did not include file metadata");
      }

      form.reset();
      setSavedFiles(uploadedFiles.filter(Boolean));
      showToast("Export action images uploaded.");
    } catch (error) {
      if (!controller.signal.aborted) {
        showToast(getErrorMessage(error), { isError: true });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = undefined;
      }
      setIsSaving(false);
      setLoading(false);
    }
  }

  function handleFileChange(
    event: Event & { currentTarget: HTMLElementTagNameMap["s-drop-zone"] },
  ) {
    const files = event.currentTarget.files.filter((file) => file.size > 0);

    if (!validateSelectedFiles(files)) {
      event.currentTarget.value = "";
      setSelectedFiles([]);
      return;
    }

    setSelectedFiles(files);
  }

  return (
    <form data-save-bar onSubmit={handleSubmit}>
      <s-page heading="Create product description">
        <s-link slot="breadcrumb-actions" href="/product-description">
          Product Description
        </s-link>

        <s-button
          slot="primary-action"
          variant="primary"
          type="submit"
          id="save-btn"
          disabled={isSaving}
          loading={isSaving}
        >
          Save
        </s-button>

        {savedFiles.length > 0 ? (
          <>
            <s-button slot="secondary-actions" commandFor="more-actions-id">
              More actions
            </s-button>
            <s-menu id="more-actions-id">
              {/* <s-button icon="view">Preview</s-button> */}
              <s-button icon="delete" tone="critical">
                Delete
              </s-button>
            </s-menu>
          </>
        ) : null}

        <s-section>
          <s-grid gap="base">
            <s-text-field
              label="Export file name"
              name="name"
              labelAccessibilityVisibility="visible"
              placeholder="Set the export file name"
              required
            ></s-text-field>
            <s-drop-zone
              label="Images"
              name="file"
              accept="image/*"
              accessibilityLabel="Upload export action images"
              multiple
              onChange={handleFileChange}
              onDropRejected={handleDropRejected}
              required
            ></s-drop-zone>
            {selectedFiles.length > 0 ? (
              <s-grid
                gap="base"
                gridTemplateColumns="repeat(auto-fill, minmax(120px, 1fr))"
              >
                {selectedFiles.map((file) => (
                  <ImagePreviewCard file={file} key={getFileKey(file)} />
                ))}
              </s-grid>
            ) : null}
          </s-grid>
        </s-section>

        {/* Use the aside slot for sidebar content */}
        <s-box slot="aside">
          <s-section heading="Puzzle summary">
            <s-heading>Mountain view</s-heading>
            <s-unordered-list>
              <s-list-item>16-piece puzzle with medium difficulty</s-list-item>
              <s-list-item>Pieces can be rotated</s-list-item>
              <s-list-item>No time limit</s-list-item>
              <s-list-item>
                <s-stack direction="inline" gap="small">
                  <s-text>Current status:</s-text>
                  <s-badge color="base" tone="success">
                    Active
                  </s-badge>
                </s-stack>
              </s-list-item>
            </s-unordered-list>
          </s-section>
        </s-box>
      </s-page>
    </form>
  );
}

function ImagePreviewCard({ file }: { file: File }) {
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return (
    <s-stack gap="small-200" alignItems="center">
      <s-box
        background="base"
        border="base"
        borderRadius="base"
        inlineSize="120px"
        overflow="hidden"
        padding="small-200"
      >
        <s-image
          alt={file.name}
          aspectRatio="1"
          borderRadius="small"
          inlineSize="fill"
          objectFit="cover"
          src={previewUrl}
        ></s-image>
      </s-box>
      <s-stack gap="none" alignItems="center">
        <s-text>{formatPreviewName(file.name)}</s-text>
        <s-text color="subdued">{getFileExtension(file)}</s-text>
      </s-stack>
    </s-stack>
  );
}

function getSelectedFiles(form: HTMLFormElement): File[] {
  const files = new FormData(form).getAll("file");
  return files.filter(
    (file): file is File => file instanceof File && file.size > 0,
  );
}

function validateSelectedFiles(files: File[]) {
  const maxFiles = getPublicNumber("APP_FILE_UPLOAD_MULTIPLE_SIZE");
  if (maxFiles !== undefined && files.length > maxFiles) {
    showToast(`Upload up to ${maxFiles} images at once.`, { isError: true });
    return false;
  }

  const maxFileSize = getPublicNumber("APP_FILE_MAX_SIZE");
  const oversizedFile = files.find(
    (file) => maxFileSize !== undefined && file.size > maxFileSize,
  );
  if (oversizedFile && maxFileSize !== undefined) {
    showToast(
      `${oversizedFile.name} is larger than ${formatFileSize(maxFileSize)}.`,
      { isError: true },
    );
    return false;
  }

  const nonImageFile = files.find((file) => !isImageFile(file));
  if (nonImageFile) {
    showToast(`${nonImageFile.name} is not an image.`, { isError: true });
    return false;
  }

  return true;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function getPublicNumber(
  key: "APP_FILE_UPLOAD_MULTIPLE_SIZE" | "APP_FILE_MAX_SIZE",
) {
  const value = globalThis.__PUBLIC_ENV__?.[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatPreviewName(name: string) {
  const maxLength = 18;
  if (name.length <= maxLength) return name;

  return `${name.slice(0, maxLength - 3)}...`;
}

function getFileExtension(file: File) {
  const extension = file.name.split(".").pop();
  return extension ? extension.toUpperCase() : "IMAGE";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function handleDropRejected() {
  showToast("Only image files can be uploaded.", { isError: true });
}

function setLoading(isLoading: boolean) {
  globalThis.shopify?.loading(isLoading);
}

function showToast(
  message: string,
  options?: Parameters<(typeof globalThis.shopify)["toast"]["show"]>[1],
) {
  globalThis.shopify?.toast.show(message, options);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
