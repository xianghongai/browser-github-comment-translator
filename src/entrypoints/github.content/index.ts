import { defineContentScript } from 'wxt/utils/define-content-script';
import { CommentTranslator } from '../../utils/comment-translator';
import './style.css';

export default defineContentScript({
  matches: ['https://github.com/*', 'https://gist.github.com/*'],
  runAt: 'document_idle',
  main() {
    new CommentTranslator().start();
  },
});
