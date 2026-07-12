import type pl from '../pl/images'

// Wypełnia Agent B — parytet kluczy z pl wymusza typ.
const images: typeof pl = {
  title: 'Images',
  all: 'All',

  // Pasek narzędzi
  searchPlaceholder: 'Search images...',
  gridViewTooltip: '<b>Grid</b> view',
  listViewTooltip: '<b>List</b> view',
  deleted: 'Deleted',
  upload: 'Upload',

  // Popup przesyłania
  uploadImages: 'Upload Images',
  filesCount: '{n} file | {n} files',
  dropHere: 'Drag & drop images here',
  or: 'or',
  chooseFiles: 'Choose Files',
  addMore: 'Add more',
  imageTitle: 'Title',
  description: 'Description',
  tagsUploadLabel: 'Tags (space-separated, at least one required)',
  collectionsUploadLabel: 'Collections (comma-separated)',
  uploadCurrent: 'Upload Current',
  uploadAll: 'Upload All',
  uploadFailed: 'Upload failed',
  uploadError: 'Failed to upload image',
  dropFilesToUpload: 'Drop files to upload',

  // Panel edycji obrazu
  editImage: 'Edit Image',
  tags: 'Tags',
  collections: 'Collections',
  restore: 'Restore',
  permanentlyDelete: 'Permanently Delete',

  // Potwierdzenia usuwania
  confirmDelete: 'Confirm Delete',
  confirmDeleteMsg: 'Are you sure you want to delete this image?',
  confirmForceDeleteMsg: 'Are you sure you want to permanently delete this image? This cannot be undone.',
  yesDelete: 'Yes, delete',
  confirmBatchDelete: 'Confirm Batch Delete',
  confirmBatchDeleteMsg: 'Are you sure you want to delete {n} image? | Are you sure you want to delete {n} images?',
  yesDeleteAll: 'Yes, delete all',

  // Zaznaczenie / edycja zbiorcza
  selectedCount: '{n} image selected | {n} images selected',
  deselect: 'Deselect',
  batchEdit: 'Batch Edit',
  deleteSelected: 'Delete Selected',
  addTags: 'Add tags',
  removeTags: 'Remove tags',
  tagsToAddPlaceholder: 'Tags to add (space-separated)',
  addCollections: 'Add collections',
  removeCollections: 'Remove collections',
  collectionsToAddPlaceholder: 'Collections to add (comma-separated)',
  applyChanges: 'Apply Changes',

  // Siatka / lista
  noImagesFound: 'No images found',
  size: 'Size',
  dimensions: 'Dimensions',
  date: 'Date',
  none: 'none',

  // Panel tagów
  clearTags: 'Clear tags',
  filterTagsPlaceholder: 'Filter tags...',
  noTagsFound: 'No tags found',
  addTag: 'Add tag',
  tagNamePlaceholder: 'Tag name...',
  add: 'Add',

  // Kolekcje
  newCollection: 'New Collection',
  collectionNamePlaceholder: 'Collection name...',
  create: 'Create',
}

export default images
