// Native <details> keeps navigation usable even when JavaScript is unavailable.
const navigation = document.querySelector('.navigation');
if (navigation) {
  const toggle = navigation.querySelector('summary');
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation.open) {
      navigation.open = false;
      toggle.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (!navigation.contains(event.target)) navigation.open = false;
  });
  navigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => { navigation.open = false; });
  });
}
