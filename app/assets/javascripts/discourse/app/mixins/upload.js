import {
  displayErrorForUpload,
  validateUploadedFiles,
} from "discourse/lib/uploads";
import I18n from "I18n";
import Mixin from "@ember/object/mixin";
import bootbox from "bootbox";
import { deepMerge } from "discourse-common/lib/object";
import getUrl from "discourse-common/lib/get-url";
import { on } from "@ember/object/evented";
import { warn } from "@ember/debug";

export default Mixin.create({
  uploading: false,
  uploadProgress: 0,

  uploadDone() {
    warn("You should implement `uploadDone`", {
      id: "discourse.upload.missing-upload-done",
    });
  },

  validateUploadedFilesOptions() {
    return {};
  },

  calculateUploadUrl() {
    return (
      getUrl(this.getWithDefault("uploadUrl", "/uploads")) +
      ".json?client_id=" +
      (this.messageBus && this.messageBus.clientId) +
      this.uploadUrlParams
    );
  },

  uploadUrlParams: "",

  uploadOptions() {
    return {};
  },

  _initialize: on("didInsertElement", function () {
    const $upload = $(this.element);
    const reset = () => {
      this.setProperties({ uploading: false, uploadProgress: 0 });
      document.getElementsByClassName("hidden-upload-field")[0].value = "";
    };
    const maxFiles = this.getWithDefault(
      "maxFiles",
      this.siteSettings.simultaneous_uploads
    );

    $upload.on("fileuploaddone", (e, data) => {
      let upload = data.result;
      this.uploadDone(upload);
      reset();
    });

    $upload.fileupload(
      deepMerge(
        {
          url: this.calculateUploadUrl(),
          dataType: "json",
          replaceFileInput: false,
          dropZone: $upload,
          pasteZone: $upload,
        },
        this.uploadOptions()
      )
    );

    $upload.on("fileuploaddrop", (e, data) => {
      if (maxFiles > 0 && data.files.length > maxFiles) {
        bootbox.alert(
          I18n.t("post.errors.too_many_dragged_and_dropped_files", {
            count: maxFiles,
          })
        );
        return false;
      } else {
        return true;
      }
    });

    $upload.on("fileuploadsubmit", (e, data) => {
      const opts = deepMerge(
        {
          bypassNewUserRestriction: true,
          user: this.currentUser,
          siteSettings: this.siteSettings,
        },
        this.validateUploadedFilesOptions()
      );
      const isValid = validateUploadedFiles(data.files, opts);
      const type = this.type;
      let form = type ? { type } : {};

      if (this.data) {
        form = Object.assign(form, this.data);
      }

      data.formData = form;
      this.setProperties({ uploadProgress: 0, uploading: isValid });

      return isValid;
    });

    $upload.on("fileuploadprogressall", (e, data) => {
      if (this.isDestroying || this.isDestroyed) {
        return;
      }

      const progress = parseInt((data.loaded / data.total) * 100, 10);
      this.set("uploadProgress", progress);
    });

    $upload.on("fileuploadfail", (e, data) => {
      displayErrorForUpload(data, this.siteSettings, data.files[0].name);
      reset();
    });
  }),

  _destroy: on("willDestroyElement", function () {
    this.messageBus && this.messageBus.unsubscribe("/uploads/" + this.type);

    const $upload = $(this.element);
    try {
      $upload.fileupload("destroy");
    } catch (e) {
      /* wasn't initialized yet */
    }
    $upload.off();
  }),
});
