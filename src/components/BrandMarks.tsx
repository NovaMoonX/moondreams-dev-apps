import { useId } from 'react';

interface BrandMarkProps {
  className?: string;
}

export function GitHubMark({ className = 'size-4' }: BrandMarkProps) {
  return (
    <svg viewBox='0 -0.25 16 16' aria-hidden='true' className={className}>
      <path
        fill='currentColor'
        d='M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656c0-.781.281-1.625.75-2.188c-.203-.515-.172-1.609.063-2.062c.625-.078 1.468.25 1.968.703c.594-.187 1.219-.281 1.985-.281c.765 0 1.39.094 1.953.265c.484-.437 1.344-.765 1.969-.687c.218.422.25 1.515.046 2.047c.5.593.766 1.39.766 2.203c0 1.922-1.453 3.375-3.547 3.64c.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03C16 3.61 12.406 0 7.984 0C3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156c-1.031 0-1.64-.562-2.078-1.609c-.172-.422-.36-.672-.719-.719c-.187-.015-.25-.093-.25-.187c0-.188.313-.328.625-.328c.453 0 .844.281 1.25.86c.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656'
      />
    </svg>
  );
}

export function ClaudeMark({ className = 'size-4' }: BrandMarkProps) {
  return (
    <svg
      viewBox='-0.25 -0.25 256.5 256.5'
      aria-hidden='true'
      className={className}
    >
      <path
        fill='#d97757'
        d='m50.228 170.321l50.357-28.257l.843-2.463l-.843-1.361h-2.462l-8.426-.518l-28.775-.778l-24.952-1.037l-24.175-1.296l-6.092-1.297L0 125.796l.583-3.759l5.12-3.434l7.324.648l16.202 1.101l24.304 1.685l17.629 1.037l26.118 2.722h4.148l.583-1.685l-1.426-1.037l-1.101-1.037l-25.147-17.045l-27.22-18.017l-14.258-10.37l-7.713-5.25l-3.888-4.925l-1.685-10.758l7-7.713l9.397.649l2.398.648l9.527 7.323l20.35 15.75L94.817 91.9l3.889 3.24l1.555-1.102l.195-.777l-1.75-2.917l-14.453-26.118l-15.425-26.572l-6.87-11.018l-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0l10.63 1.426l4.472 3.888l6.61 15.101l10.694 23.786l16.591 32.34l4.861 9.592l2.592 8.879l.973 2.722h1.685v-1.556l1.36-18.211l2.528-22.36l2.463-28.776l.843-8.1l4.018-9.722l7.971-5.25l6.222 2.981l5.12 7.324l-.713 4.73l-3.046 19.768l-5.962 30.98l-3.889 20.739h2.268l2.593-2.593l10.499-13.934l17.628-22.036l7.778-8.749l9.073-9.657l5.833-4.601h11.018l8.1 12.055l-3.628 12.443l-11.342 14.388l-9.398 12.184l-13.48 18.147l-8.426 14.518l.778 1.166l2.01-.194l30.46-6.481l16.462-2.982l19.637-3.37l8.88 4.148l.971 4.213l-3.5 8.62l-20.998 5.184l-24.628 4.926l-36.682 8.685l-.454.324l.519.648l16.526 1.555l7.065.389h17.304l32.21 2.398l8.426 5.574l5.055 6.805l-.843 5.184l-12.962 6.611l-17.498-4.148l-40.83-9.721l-14-3.5h-1.944v1.167l11.666 11.406l21.387 19.314l26.767 24.887l1.36 6.157l-3.434 4.86l-3.63-.518l-23.526-17.693l-9.073-7.972l-20.545-17.304h-1.36v1.814l4.73 6.935l25.017 37.59l1.296 11.536l-1.814 3.76l-6.481 2.268l-7.13-1.297l-14.647-20.544l-15.1-23.138l-12.185-20.739l-1.49.843l-7.194 77.448l-3.37 3.953l-7.778 2.981l-6.48-4.925l-3.436-7.972l3.435-15.749l4.148-20.544l3.37-16.333l3.046-20.285l1.815-6.74l-.13-.454l-1.49.194l-15.295 20.999l-23.267 31.433l-18.406 19.702l-4.407 1.75l-7.648-3.954l.713-7.064l4.277-6.286l25.47-32.405l15.36-20.092l9.917-11.6l-.065-1.686h-.583L44.07 198.125l-12.055 1.555l-5.185-4.86l.648-7.972l2.463-2.593l20.35-13.999z'
      />
    </svg>
  );
}

/** The Google Calendar tile, for an offer or row that connects it. */
export function GoogleCalendarMark({ className = 'size-5' }: BrandMarkProps) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg
      viewBox='-9.417 -0.083 274.834 274.834'
      aria-hidden='true'
      className={className}
    >
      <defs>
        <linearGradient
          id={`${id}a`}
          x1='83'
          x2='83'
          y1='76'
          gradientUnits='userSpaceOnUse'
        >
          <stop stopColor='#4fa0ff' />
          <stop offset='1' stopColor='#3186ff' />
        </linearGradient>
        <linearGradient
          id={`${id}b`}
          x1='89.06'
          x2='89.06'
          y1='21.75'
          y2='96.39'
          gradientUnits='userSpaceOnUse'
        >
          <stop stopColor='#a9a8ff' />
          <stop offset='.8' stopColor='#3c90ff' />
        </linearGradient>
        <filter
          id={`${id}c`}
          width='152'
          height='112'
          x='20'
          y='-4'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_37330_7673'
            stdDeviation='6'
          />
        </filter>
      </defs>
      <mask
        id={`${id}d`}
        width='154'
        height='152'
        x='19'
        y='20'
        maskUnits='userSpaceOnUse'
        style={{ maskType: 'alpha' }}
      >
        <path
          fill='#3c90ff'
          d='M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z'
        />
      </mask>
      <mask
        id={`${id}e`}
        width='154'
        height='152'
        x='19'
        y='20'
        maskUnits='userSpaceOnUse'
        style={{ maskType: 'alpha' }}
      >
        <path
          fill='#3186ff'
          d='M19.867 49.392C17.818 33.82 29.94 20 45.645 20h100.71c15.706 0 27.827 13.82 25.778 29.392L166 96l6.133 46.608C174.182 158.18 162.061 172 146.355 172H45.645c-15.706 0-27.827-13.82-25.778-29.392L26 96z'
        />
      </mask>
      <path
        fill='#bbe2ff'
        d='M20.824 48.078c0-26.641 21.596-48.239 48.238-48.239h117.917c26.641 0 48.238 21.598 48.238 48.239v50.918c0 26.641-21.597 48.239-48.238 48.239H69.062c-26.642 0-48.238-21.598-48.238-48.239z'
      />
      <path
        fill='#3c90ff'
        d='M.502 69.169c-3.432-26.082 16.871-49.23 43.177-49.23h168.683c26.306 0 46.609 23.148 43.178 49.23l-10.273 78.066l10.273 78.066c3.431 26.082-16.872 49.23-43.178 49.23H43.679c-26.307 0-46.609-23.148-43.177-49.23l10.272-78.066z'
      />
      <g
        mask={`url(#${id}d)`}
        transform='translate(-32.775 -13.56)scale(1.67495)'
      >
        <path
          fill={`url(#${id}a)`}
          d='M0 0h166v76H0z'
          transform='matrix(1 0 0 -1 13 172)'
        />
      </g>
      <g
        mask={`url(#${id}e)`}
        transform='translate(-32.775 -13.56)scale(1.67495)'
      >
        <path
          fill={`url(#${id}b)`}
          d='M32 27.2C32 16.596 40.596 8 51.2 8h89.6c10.604 0 19.2 8.596 19.2 19.2V96H32z'
          filter={`url(#${id}c)`}
        />
      </g>
      <path
        fill='#fff'
        d='M93.438 209.77q-10.521 0-18.051-3.421q-7.528-3.422-12.746-9.153q-5.133-5.82-7.273-11.379q-2.137-5.558-1.711-6.758a3.47 3.47 0 0 1 1.711-1.882l9.497-3.765q1.196-.598 2.395-.17q1.196.34 2.822 3.935q1.714 3.592 4.79 7.613a24 24 0 0 0 7.529 6.245q4.368 2.226 10.779 2.225q10.351 0 16.426-5.99q6.16-5.986 6.16-15.226q0-10.01-6.503-15.4q-6.5-5.476-17.195-5.476h-8.981a3.17 3.17 0 0 1-2.225-.853q-.853-.94-.855-2.139v-9.153q0-1.284.854-2.14a3.06 3.06 0 0 1 2.226-.94h7.783q9.583 0 15.4-5.22q5.817-5.218 5.816-13.517q.002-8.21-5.218-13.258t-14.371-5.049q-5.135.001-8.898 1.712a19.3 19.3 0 0 0-6.502 4.791a38.3 38.3 0 0 0-4.705 6.33q-1.964 3.252-3.165 3.593q-1.195.256-2.31-.426l-8.983-4.364q-1.11-.599-1.454-1.882q-.342-1.284 2.055-5.989q2.48-4.788 7.526-9.752a35.2 35.2 0 0 1 11.807-7.7q6.758-2.74 15.741-2.738q16.681.001 26.434 8.81q9.752 8.73 9.753 23.099q0 9.926-4.79 17.196q-4.706 7.27-13.347 10.268v.341q10.438 3.08 16.425 11.291c4.05 5.421 6.075 11.891 6.074 19.419q0 16.17-11.293 26.522q-11.29 10.35-29.429 10.35zm85.841-1.967q-1.452 0-2.567-1.112a3.78 3.78 0 0 1-1.026-2.652v-95.131l-19.249 13.859q-1.026.77-2.396.514a3.3 3.3 0 0 1-2.052-1.283l-5.561-7.871a3.32 3.32 0 0 1-.6-2.397q.258-1.365 1.369-2.136l34.133-24.382q.43-.343.942-.514q.515-.256 1.197-.256h7.188q1.455.001 2.31 1.027q.941.94.941 2.396v116.174q0 1.542-1.112 2.652a3.35 3.35 0 0 1-2.568 1.112z'
      />
    </svg>
  );
}

/** Gemini's spark in its blue-to-rose gradient, for steps or rows that name Gemini. */
export function GeminiMark({ className = 'size-4' }: BrandMarkProps) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg
      viewBox='-0.5 -0.25 256.5 256.5'
      aria-hidden='true'
      className={className}
    >
      <defs>
        <filter
          id={`${id}a`}
          width='39.274'
          height='43.217'
          x='-19.824'
          y='13.152'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='2.46'
          />
        </filter>
        <filter
          id={`${id}b`}
          width='84.868'
          height='85.688'
          x='-15.001'
          y='-40.257'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='11.891'
          />
        </filter>
        <filter
          id={`${id}c`}
          width='79.454'
          height='90.917'
          x='-20.776'
          y='11.927'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='10.109'
          />
        </filter>
        <filter
          id={`${id}d`}
          width='79.731'
          height='81.505'
          x='-19.845'
          y='15.459'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='10.109'
          />
        </filter>
        <filter
          id={`${id}e`}
          width='75.117'
          height='73.758'
          x='29.832'
          y='-11.552'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='9.606'
          />
        </filter>
        <filter
          id={`${id}f`}
          width='78.135'
          height='78.758'
          x='-38.583'
          y='-16.253'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='8.706'
          />
        </filter>
        <filter
          id={`${id}g`}
          width='78.877'
          height='77.539'
          x='8.107'
          y='-5.966'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='7.775'
          />
        </filter>
        <filter
          id={`${id}h`}
          width='56.272'
          height='51.81'
          x='13.587'
          y='-18.488'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='6.957'
          />
        </filter>
        <filter
          id={`${id}i`}
          width='70.856'
          height='69.306'
          x='-15.526'
          y='-31.297'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='5.876'
          />
        </filter>
        <filter
          id={`${id}j`}
          width='55.502'
          height='51.571'
          x='-14.168'
          y='20.964'
          colorInterpolationFilters='sRGB'
          filterUnits='userSpaceOnUse'
        >
          <feFlood floodOpacity='0' result='BackgroundImageFix' />
          <feBlend in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
          <feGaussianBlur
            result='effect1_foregroundBlur_10859_4895'
            stdDeviation='7.273'
          />
        </filter>
        <linearGradient
          id={`${id}k`}
          x1='18.447'
          x2='52.153'
          y1='43.42'
          y2='15.004'
          gradientUnits='userSpaceOnUse'
        >
          <stop stopColor='#4893fc' />
          <stop offset='.27' stopColor='#4893fc' />
          <stop offset='.777' stopColor='#969dff' />
          <stop offset='1' stopColor='#bd99fe' />
        </linearGradient>
      </defs>
      <path
        fill='#fff'
        d='M228.265 114.441c-19.721-8.49-36.974-20.134-51.776-34.927c-14.792-14.789-26.436-32.056-34.93-51.779a154 154 0 0 1-7.884-23.295A5.86 5.86 0 0 0 127.999 0a5.86 5.86 0 0 0-5.674 4.44a154 154 0 0 1-7.882 23.295c-8.494 19.723-20.141 36.99-34.929 51.779c-14.794 14.793-32.058 26.437-51.779 34.927a154 154 0 0 1-23.297 7.889A5.855 5.855 0 0 0 0 127.999a5.86 5.86 0 0 0 4.438 5.678a154 154 0 0 1 23.297 7.886c19.721 8.49 36.978 20.139 51.779 34.93c14.795 14.789 26.435 32.055 34.929 51.774a154 154 0 0 1 7.882 23.297a5.854 5.854 0 0 0 5.674 4.436a5.85 5.85 0 0 0 5.676-4.436a154 154 0 0 1 7.884-23.297q12.742-29.58 34.93-51.774c14.793-14.791 32.055-26.44 51.776-34.93a154 154 0 0 1 23.297-7.886a5.86 5.86 0 0 0 4.438-5.678a5.855 5.855 0 0 0-4.438-5.669a154.4 154.4 0 0 1-23.297-7.889'
      />
      <g
        filter={`url(#${id}a)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='14.407'
          cy='16.95'
          fill='#ffe432'
          rx='14.407'
          ry='16.95'
          transform='rotate(19.552 -44.576 -16.496)'
        />
      </g>
      <g
        filter={`url(#${id}b)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='27.433'
          cy='2.587'
          fill='#fc413d'
          rx='18.652'
          ry='19.062'
        />
      </g>
      <g
        filter={`url(#${id}c)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='18.951'
          cy='57.386'
          fill='#00b95c'
          rx='19.493'
          ry='25.253'
          transform='rotate(-2.799 18.951 57.386)'
        />
      </g>
      <g
        filter={`url(#${id}c)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='18.951'
          cy='57.386'
          fill='#00b95c'
          rx='19.493'
          ry='25.253'
          transform='rotate(-2.799 18.951 57.386)'
        />
      </g>
      <g
        filter={`url(#${id}d)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='20.02'
          cy='56.211'
          fill='#00b95c'
          rx='19.107'
          ry='21.035'
          transform='rotate(-31.318 20.02 56.211)'
        />
      </g>
      <g
        filter={`url(#${id}e)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='67.391'
          cy='25.327'
          fill='#3186ff'
          rx='18.346'
          ry='17.667'
        />
      </g>
      <g
        filter={`url(#${id}f)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='21.222'
          cy='22.384'
          fill='#fbbc04'
          rx='21.222'
          ry='22.384'
          transform='rotate(37.252 9.752 -8.009)'
        />
      </g>
      <g
        filter={`url(#${id}g)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='24.469'
          cy='22.604'
          fill='#3186ff'
          rx='24.469'
          ry='22.604'
          transform='rotate(34.51 19.587 64.852)'
        />
      </g>
      <g
        filter={`url(#${id}h)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <path
          fill='#749bff'
          d='M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727s-15.557 6.631-18.39 2.78c-2.833-3.853.807-11.342 8.13-16.728s15.558-6.631 18.39-2.78'
        />
      </g>
      <g
        filter={`url(#${id}i)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='19.902'
          cy='3.356'
          fill='#fc413d'
          rx='27.971'
          ry='17.388'
          transform='rotate(-42.848 19.902 3.356)'
        />
      </g>
      <g
        filter={`url(#${id}j)`}
        mask={`url(#${id}l)`}
        transform='translate(-.101 -.049)scale(3.9436)'
      >
        <ellipse
          cx='13.583'
          cy='46.75'
          fill='#ffee48'
          rx='14.989'
          ry='8.717'
          transform='rotate(35.592 13.583 46.75)'
        />
      </g>
      <mask
        id={`${id}l`}
        width='65'
        height='65'
        x='0'
        y='0'
        maskUnits='userSpaceOnUse'
        style={{ maskType: 'alpha' }}
      >
        <path d='M32.447 0c.68 0 1.273.465 1.439 1.125a39 39 0 0 0 1.999 5.905q3.23 7.5 8.854 13.125q5.627 5.626 13.125 8.855a39 39 0 0 0 5.906 1.999c.66.166 1.124.758 1.124 1.438s-.464 1.273-1.125 1.439a39 39 0 0 0-5.905 1.999q-7.5 3.23-13.125 8.854q-5.625 5.627-8.854 13.125a39 39 0 0 0-2 5.906a1.485 1.485 0 0 1-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a39 39 0 0 0-2-5.905q-3.227-7.5-8.854-13.125q-5.625-5.625-13.125-8.854a39 39 0 0 0-5.905-2A1.485 1.485 0 0 1 0 32.448c0-.68.465-1.272 1.125-1.438a39 39 0 0 0 5.905-2q7.5-3.228 13.125-8.854q5.626-5.624 8.855-13.125a39 39 0 0 0 1.999-5.905A1.485 1.485 0 0 1 32.447 0' />
        <path
          fill={`url(#${id}k)`}
          d='M32.447 0c.68 0 1.273.465 1.439 1.125a39 39 0 0 0 1.999 5.905q3.23 7.5 8.854 13.125q5.627 5.626 13.125 8.855a39 39 0 0 0 5.906 1.999c.66.166 1.124.758 1.124 1.438s-.464 1.273-1.125 1.439a39 39 0 0 0-5.905 1.999q-7.5 3.23-13.125 8.854q-5.625 5.627-8.854 13.125a39 39 0 0 0-2 5.906a1.485 1.485 0 0 1-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a39 39 0 0 0-2-5.905q-3.227-7.5-8.854-13.125q-5.625-5.625-13.125-8.854a39 39 0 0 0-5.905-2A1.485 1.485 0 0 1 0 32.448c0-.68.465-1.272 1.125-1.438a39 39 0 0 0 5.905-2q7.5-3.228 13.125-8.854q5.626-5.624 8.855-13.125a39 39 0 0 0 1.999-5.905A1.485 1.485 0 0 1 32.447 0'
        />
      </mask>
    </svg>
  );
}

export function GmailMark({ className = 'size-5' }: BrandMarkProps) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg viewBox='0 -26 256 256' aria-hidden='true' className={className}>
      <defs>
        <linearGradient
          id={`${id}a`}
          x1='165'
          x2='165'
          y1='44'
          y2='166'
          gradientUnits='userSpaceOnUse'
        >
          <stop stopColor='#60d673' />
          <stop offset='.17' stopColor='#42c868' />
          <stop offset='.39' stopColor='#0ebc5f' />
          <stop offset='.62' stopColor='#00a9bb' />
          <stop offset='.86' stopColor='#3c90ff' />
          <stop offset='1' stopColor='#3186ff' />
        </linearGradient>
        <linearGradient
          id={`${id}b`}
          x1='8'
          x2='184'
          y1='46.13'
          y2='46.13'
          gradientUnits='userSpaceOnUse'
        >
          <stop offset='.08' stopColor='#ff63a0' />
          <stop offset='.3' stopColor='#fc413d' />
          <stop offset='.5' stopColor='#fc413d' />
          <stop offset='.65' stopColor='#fc413d' />
          <stop offset='.72' stopColor='#fc5c30' />
          <stop offset='.86' stopColor='#feb10c' />
          <stop offset='.91' stopColor='#fec700' />
          <stop offset='.96' stopColor='#ffdb0f' />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}a)`}
        d='M146 44h38v110c0 6.627-5.373 12-12 12h-20a6 6 0 0 1-6-6z'
        transform='translate(-11.636 -37.818)scale(1.45454)'
      />
      <path
        fill='#fc413d'
        d='M55.273 26.182H0v160c0 9.638 7.816 17.454 17.455 17.454h29.09a8.727 8.727 0 0 0 8.728-8.728z'
      />
      <path
        fill={`url(#${id}b)`}
        d='M39.226 30.456c-8.033-6.752-20.018-5.714-26.77 2.319c-6.752 8.032-5.714 20.017 2.319 26.77l76.078 63.949a8 8 0 0 0 10.295 0l76.078-63.95c8.032-6.752 9.07-18.737 2.318-26.77c-6.752-8.032-18.737-9.07-26.769-2.318L96 78.18z'
        transform='translate(-11.636 -37.818)scale(1.45454)'
      />
    </svg>
  );
}

export function GoogleDriveMark({ className = 'size-5' }: BrandMarkProps) {
  const id = useId().replace(/[^\w-]/g, '');
  return (
    <svg viewBox='0 -9.25 256 256' aria-hidden='true' className={className}>
      <defs>
        <linearGradient
          id={`${id}a`}
          x1='86.924%'
          x2='7.63%'
          y1='94.294%'
          y2='45.952%'
        >
          <stop offset='9%' stopColor='#ffe921' />
          <stop offset='100%' stopColor='#fec700' />
        </linearGradient>
        <linearGradient
          id={`${id}b`}
          x1='99.538%'
          x2='23.437%'
          y1='93.901%'
          y2='54.033%'
        >
          <stop offset='15%' stopColor='#a9a8ff' />
          <stop offset='33%' stopColor='#6d97ff' />
          <stop offset='48%' stopColor='#3186ff' />
        </linearGradient>
        <linearGradient
          id={`${id}c`}
          x1='87.128%'
          x2='-.639%'
          y1='51.518%'
          y2='93.078%'
        >
          <stop offset='55%' stopColor='#0ebc5f' />
          <stop offset='85%' stopColor='#78c9ff' />
        </linearGradient>
        <path
          id={`${id}d`}
          d='M77.303 29.27c22.531-39.026 78.863-39.027 101.394 0l69.373 120.158c22.531 39.027-5.633 87.81-50.698 87.81H58.628c-45.065 0-73.23-48.783-50.698-87.81z'
        />
      </defs>
      <mask id={`${id}e`} fill='#fff'>
        <use href={`#${id}d`} />
      </mask>
      <g mask={`url(#${id}e)`}>
        <path
          fill={`url(#${id}a)`}
          d='M341.719 295.937H200.166l-29.293-50.735l70.777-122.589z'
          transform='translate(-42.87 -58.67)'
        />
        <path
          fill={`url(#${id}b)`}
          d='m0 295.916l100.069-173.325v.003l-29.282 50.723h58.57l70.783 122.596l-200.138.001z'
          transform='translate(-42.87 -58.67)'
        />
        <path
          fill={`url(#${id}c)`}
          d='m170.881 0l70.781 122.6l-29.286 50.726H70.812z'
          transform='translate(-42.87 -58.67)'
        />
      </g>
    </svg>
  );
}

export function GoogleMark({ className = 'size-5' }: BrandMarkProps) {
  return (
    <svg
      viewBox='-2.765 0.018 261.529 261.529'
      aria-hidden='true'
      className={className}
    >
      <path
        fill='#4285f4'
        d='M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027'
      />
      <path
        fill='#34a853'
        d='M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1'
      />
      <path
        fill='#fbbc05'
        d='M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z'
      />
      <path
        fill='#eb4335'
        d='M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251'
      />
    </svg>
  );
}

export function ChatGptMark({ className = 'size-4' }: BrandMarkProps) {
  return (
    <svg
      viewBox='1.945 1.969 20.063 20.063'
      aria-hidden='true'
      className={className}
    >
      <path
        fill='currentColor'
        d='M20.562 10.188c.25-.688.313-1.376.25-2.063c-.062-.687-.312-1.375-.625-2c-.562-.937-1.375-1.687-2.312-2.125c-1-.437-2.063-.562-3.125-.312c-.5-.5-1.063-.938-1.688-1.25S11.687 2 11 2a5.17 5.17 0 0 0-3 .938c-.875.624-1.5 1.5-1.813 2.5c-.75.187-1.375.5-2 .875c-.562.437-1 1-1.375 1.562c-.562.938-.75 2-.625 3.063a5.44 5.44 0 0 0 1.25 2.874a4.7 4.7 0 0 0-.25 2.063c.063.688.313 1.375.625 2c.563.938 1.375 1.688 2.313 2.125c1 .438 2.062.563 3.125.313c.5.5 1.062.937 1.687 1.25S12.312 22 13 22a5.17 5.17 0 0 0 3-.937c.875-.625 1.5-1.5 1.812-2.5a4.54 4.54 0 0 0 1.938-.875c.562-.438 1.062-.938 1.375-1.563c.562-.937.75-2 .625-3.062c-.125-1.063-.5-2.063-1.188-2.876m-7.5 10.5c-1 0-1.75-.313-2.437-.875c0 0 .062-.063.125-.063l4-2.312a.5.5 0 0 0 .25-.25a.57.57 0 0 0 .062-.313V11.25l1.688 1v4.625a3.685 3.685 0 0 1-3.688 3.813M5 17.25c-.438-.75-.625-1.625-.438-2.5c0 0 .063.063.125.063l4 2.312a.56.56 0 0 0 .313.063c.125 0 .25 0 .312-.063l4.875-2.812v1.937l-4.062 2.375A3.7 3.7 0 0 1 7.312 19c-1-.25-1.812-.875-2.312-1.75M3.937 8.563a3.8 3.8 0 0 1 1.938-1.626v4.751c0 .124 0 .25.062.312a.5.5 0 0 0 .25.25l4.875 2.813l-1.687 1l-4-2.313a3.7 3.7 0 0 1-1.75-2.25c-.25-.937-.188-2.062.312-2.937M17.75 11.75l-4.875-2.812l1.687-1l4 2.312c.625.375 1.125.875 1.438 1.5s.5 1.313.437 2.063a3.7 3.7 0 0 1-.75 1.937c-.437.563-1 1-1.687 1.25v-4.75c0-.125 0-.25-.063-.312c0 0-.062-.126-.187-.188m1.687-2.5s-.062-.062-.125-.062l-4-2.313c-.125-.062-.187-.062-.312-.062s-.25 0-.313.062L9.812 9.688V7.75l4.063-2.375c.625-.375 1.312-.5 2.062-.5c.688 0 1.375.25 2 .688c.563.437 1.063 1 1.313 1.625s.312 1.375.187 2.062m-10.5 3.5l-1.687-1V7.063c0-.688.187-1.438.562-2C8.187 4.438 8.75 4 9.375 3.688a3.37 3.37 0 0 1 2.062-.313c.688.063 1.375.375 1.938.813c0 0-.063.062-.125.062l-4 2.313a.5.5 0 0 0-.25.25c-.063.125-.063.187-.063.312zm.875-2L12 9.5l2.187 1.25v2.5L12 14.5l-2.188-1.25z'
      />
    </svg>
  );
}

export function GoogleContactsMark({ className = 'size-5' }: BrandMarkProps) {
  return (
    <svg viewBox='0 0 512 512' aria-hidden='true' className={className}>
      <path
        fill='#86a9ff'
        d='M203.5 249.4c-90.7 0-164.1 73.4-164.1 164.1v68.9c0 16.3 13.2 29.5 29.5 29.5h78.8l78.8-262.6h-23z'
      />
      <path
        fill='#578cff'
        d='M472.6 357.7c0-59.9-48.4-108.3-108.3-108.3h-78.8V512h78.8c59.9 0 108.3-48.4 108.3-108.3'
      />
      <path
        fill='#0057cc'
        d='M118.2 357.7c0-59.9 48.4-108.3 108.3-108.3h59.1c59.9 0 108.3 48.4 108.3 108.3v45.9c0 59.9-48.4 108.3-108.3 108.3H147.7c-16.3 0-29.5-13.2-29.5-29.5zM256 0c56.2 0 101.7 45.6 101.7 101.7S312.2 203.5 256 203.5s-101.7-45.6-101.7-101.7S199.8 0 256 0'
      />
    </svg>
  );
}
