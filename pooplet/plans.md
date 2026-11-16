# Plans.md
1. Inspect `/home/aidah/Documents/Aidah's Stuff/Projects/Aidah-Site` fully.
2. build the same index.html file in our cleanup/ folder, along with css HOWEVER, I want cleaner and smarter files with smarter decisions. I do not want to keep so many color variables in the css file, only the following ones:
--bg-pri
--bg-sec
--bg-ter

--txt-n (normal)
--txt-m (muted)
--txt-f (faint)

--blue-dark 153977
--red-dark 771515
--gold-dark 775315

--red
--blue-bright 2048be
--gold 

and a few very used ones like some repeating border colours
I want smart + short variable naming too.

Any other colours that are in code as variables but only used a couple of times? just hardcode them in css.

and make sure to use the radius variables:
    --radius-def: 8px;
    --radius-xxs: calc(var(--radius-def) * 0.4);
    --radius-xs: calc(var(--radius-def) * 0.6);
    --radius-s: calc(var(--radius-def) * 0.8);
    --radius-m: calc(var(--radius-def) * 1);
    --radius-l: calc(var(--radius-def) * 1.2);
    --radius-xl: calc(var(--radius-def) * 1.4);
    --radius-xxl: calc(var(--radius-def) * 1.6);

instead of hardcoded values.

3. I want the responsive design to be kept, such as the transition happening from desktop screen -> tablet -> phone screen. Currently, in the `/home/aidah/Documents/Aidah's Stuff/Projects/Aidah-Site/index.html`, it is well done and perfected.

4. in the footer, I want the icon colours for contact me to be changed and made more on brand.

Do this for now. And remember, the focus is:
    - code cleanup
    - little to no comments other than section headings
    - the same look & responsive design kept

