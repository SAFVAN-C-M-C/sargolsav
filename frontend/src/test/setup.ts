import { configure } from '@testing-library/react';

// Lazy routes now initialize MUI and Emotion as well as their feature modules.
configure({ asyncUtilTimeout: 3000 });
